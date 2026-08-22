<?php

namespace App\Services;

use App\Models\Book;
use Dompdf\Dompdf;
use Dompdf\Options;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class BookPdfService
{
    public function render(Book $book, array $settings): string
    {
        $options = new Options;
        $options->set('defaultFont', 'DejaVu Sans');
        $options->set('isRemoteEnabled', false);
        $pdf = new Dompdf($options);
        $paper = $this->paper($settings['format']);
        $pdf->setPaper([0, 0, $paper['width'] * 72 / 25.4, $paper['height'] * 72 / 25.4]);
        $pdf->loadHtml($this->html($book, $settings), 'UTF-8');
        $pdf->render();
        if ($settings['layout']['page_numbers']) {
            $canvas = $pdf->getCanvas();
            $canvas->page_text($canvas->get_width() / 2 - 22, $canvas->get_height() - 30, '{PAGE_NUM}', 'DejaVu Sans', 8, [0.34, 0.40, 0.49]);
        }
        $canvas = $pdf->getCanvas();
        $canvas->get_cpdf()->addInfo('Title', (string) ($settings['metadata']['title'] ?? ''));
        $canvas->get_cpdf()->addInfo('Author', (string) ($settings['metadata']['author'] ?? ''));
        $canvas->get_cpdf()->addInfo('Creator', 'Audiobook Tools');
        return $pdf->output();
    }

    public function store(Book $book, array $settings): string
    {
        $path = 'book-pdfs/'.$book->key_book.'/'.Str::slug($settings['metadata']['title'] ?: $book->name).'.pdf';
        Storage::disk('public')->put($path, $this->render($book, $settings));
        return $path;
    }

    private function html(Book $book, array $settings): string
    {
        $meta = $settings['metadata']; $layout = $settings['layout']; $paper = $this->paper($settings['format']);
        $body = $book->book_design_json['styles']['body'] ?? [];
        $fontSize = max(9, min(18, (float) ($body['font_size'] ?? 11)));
        $lineHeight = max(1.2, min(2, (float) ($body['line_height'] ?? 1.55)));
        $color = preg_match('/^#[0-9a-fA-F]{6}$/', $body['color'] ?? '') ? $body['color'] : '#182033';
        $cover = $layout['include_cover'] ? $this->coverDataUri($book) : null;
        $blocks = $book->blocks()->where('status', '!=', 'deleted')->orderBy('sort_order')->get();
        $content = '';
        $richText = new BookRichTextRenderer;
        foreach ($blocks as $block) {
            $node = $block->content_json ?? [];
            if (! $node) {
                $node = ['type' => in_array($block->type, ['heading', 'chapter', 'chapter_title'], true) ? 'heading' : 'paragraph', 'content' => [['type' => 'text', 'text' => $block->text_plain]]];
            }
            $content .= $richText->render($node, [
                'chapter_new_page' => $layout['chapter_new_page'],
                'image' => fn (array $attrs) => ($image = $this->imageDataUri((string) ($attrs['src'] ?? '')))
                    ? '<figure><img class="manuscript-image" src="'.$image.'" alt="'.$this->escape($attrs['alt'] ?? '').'"/></figure>'
                    : '',
            ]);
        }
        $titlePage = $layout['title_page'] ? '<section class="title-page">'.($cover ? '<img class="cover" src="'.$cover.'"/>' : '').'<h1>'.$this->escape($meta['title']).'</h1>'.($meta['subtitle'] ? '<p class="subtitle">'.$this->escape($meta['subtitle']).'</p>' : '').($meta['author'] ? '<p class="author">'.$this->escape($meta['author']).'</p>' : '').'</section>' : '';
        $copyright = $layout['copyright_page'] ? '<section class="copyright"><p>'.$this->escape($meta['rights'] ?: 'All rights reserved.').'</p>'.($meta['publisher'] ? '<p>'.$this->escape($meta['publisher']).'</p>' : '').'</section>' : '';
        return '<!doctype html><html><head><meta charset="utf-8"><style>@page { margin: '.$layout['margin_top'].'mm '.$layout['margin_outside'].'mm '.$layout['margin_bottom'].'mm '.$layout['margin_inside'].'mm; size: '.$paper['width'].'mm '.$paper['height'].'mm; } body { font-family: DejaVu Sans, sans-serif; font-size: '.$fontSize.'pt; line-height: '.$lineHeight.'; color: '.$color.'; } p { margin: 0 0 1em; text-align: '.$layout['alignment'].'; } h1 { font-size: '.max(18, $fontSize * 2).'pt; line-height:1.15; margin: 0 0 1.4em; } h1.chapter, .page-break { page-break-before: always; } blockquote { margin:1.4em 1.5em; color:#475569; font-style:italic; } ul,ol { margin:0 0 1em 1.4em; } a { color:#1d4ed8; text-decoration:underline; } .align-left { text-align:left; } .align-center { text-align:center; } .align-right { text-align:right; } .align-justify { text-align:justify; } figure { margin:1.8em 0; text-align:center; } .manuscript-image { max-width:100%; max-height:520pt; object-fit:contain; } .scene-break { width:32%; margin:1.6em auto; border:0; border-top:1px solid #64748b; } .title-page { text-align:center; page-break-after:always; padding-top:28%; } .title-page h1 { font-size:30pt; } .subtitle { text-align:center; font-size:15pt; } .author { text-align:center; margin-top:3em; } .cover { width:100%; max-height:540pt; object-fit:contain; margin-bottom:2em; } .copyright { page-break-after:always; padding-top:62%; font-size:8pt; color:#667085; }</style></head><body>'.$titlePage.$copyright.($content ?: '<p>No manuscript content has been added yet.</p>').'</body></html>';
    }

    private function paper(array $format): array
    {
        return match ($format['size']) {
            'a4' => ['width' => 210, 'height' => 297], 'a5' => ['width' => 148, 'height' => 210], 'a6' => ['width' => 105, 'height' => 148], 'letter' => ['width' => 215.9, 'height' => 279.4], 'six_by_nine' => ['width' => 152.4, 'height' => 228.6],
            default => ['width' => (float) $format['width_mm'], 'height' => (float) $format['height_mm']],
        };
    }

    private function coverDataUri(Book $book): ?string
    {
        $path = $this->publicPath((string) $book->cover_img);
        if (! $path || !Storage::disk('public')->exists($path)) return null;
        return 'data:'.(Storage::disk('public')->mimeType($path) ?: 'image/jpeg').';base64,'.base64_encode(Storage::disk('public')->get($path));
    }

    private function imageDataUri(string $url): ?string
    {
        $path = $this->publicPath($url);
        if (! $path || !Storage::disk('public')->exists($path)) return null;
        return 'data:'.(Storage::disk('public')->mimeType($path) ?: 'image/jpeg').';base64,'.base64_encode(Storage::disk('public')->get($path));
    }

    private function publicPath(string $url): ?string
    {
        if ($url === '') return null;
        $pathUrl = parse_url($url, PHP_URL_PATH) ?: $url;
        $prefixPath = rtrim((string) (parse_url(Storage::disk('public')->url(''), PHP_URL_PATH) ?: Storage::disk('public')->url('')), '/').'/';
        if (!str_starts_with($pathUrl, $prefixPath)) return null;

        return ltrim(substr($pathUrl, strlen($prefixPath)), '/');
    }

    private function escape(?string $value): string { return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8'); }
}
