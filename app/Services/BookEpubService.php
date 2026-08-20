<?php

namespace App\Services;

use App\Models\Book;
use App\Models\BookBlock;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use ZipArchive;

class BookEpubService
{
    public function build(Book $book, array $settings): string
    {
        $temporary = tempnam(sys_get_temp_dir(), 'audiobook-tools-epub-');
        $zip = new ZipArchive;
        if ($zip->open($temporary, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new \RuntimeException('Unable to create the ePub archive.');
        }

        $zip->addFromString('mimetype', 'application/epub+zip');
        $zip->setCompressionName('mimetype', ZipArchive::CM_STORE);
        $zip->addFromString('META-INF/container.xml', $this->containerDocument());

        $identifier = $settings['metadata']['identifier'] ?: 'urn:uuid:'.Str::uuid();
        $blocks = $book->blocks()->where('status', '!=', 'deleted')->orderBy('sort_order')->get();
        $chapters = $this->chapters($blocks, $settings['reading']['chapter_break']);
        $manifest = [];
        $spine = [];

        $zip->addFromString('OEBPS/styles/book.css', $this->stylesheet($book));
        $manifest[] = ['id' => 'css', 'href' => 'styles/book.css', 'media' => 'text/css'];

        $cover = $this->cover($book);
        if ($cover) {
            $zip->addFromString('OEBPS/images/cover.'.$cover['extension'], $cover['contents']);
            $manifest[] = ['id' => 'cover-image', 'href' => 'images/cover.'.$cover['extension'], 'media' => $cover['mime'], 'properties' => 'cover-image'];
        }

        if ($settings['reading']['include_title_page']) {
            $zip->addFromString('OEBPS/text/title-page.xhtml', $this->titlePage($settings, $cover));
            $manifest[] = ['id' => 'title-page', 'href' => 'text/title-page.xhtml', 'media' => 'application/xhtml+xml'];
            $spine[] = 'title-page';
        }

        foreach ($chapters as $index => $chapter) {
            $id = 'chapter-'.($index + 1);
            $zip->addFromString("OEBPS/text/{$id}.xhtml", $this->chapterDocument($chapter['title'], $chapter['paragraphs']));
            $manifest[] = ['id' => $id, 'href' => "text/{$id}.xhtml", 'media' => 'application/xhtml+xml'];
            $spine[] = $id;
        }

        // EPUB 3 readers expect a navigation document. The setting is retained
        // as publication preference while this semantic navigation remains in
        // every generated package for broad store and reader compatibility.
        $zip->addFromString('OEBPS/nav.xhtml', $this->navigation($settings, $chapters));
        $manifest[] = ['id' => 'nav', 'href' => 'nav.xhtml', 'media' => 'application/xhtml+xml', 'properties' => 'nav'];
        $zip->addFromString('OEBPS/content.opf', $this->packageDocument($settings, $identifier, $manifest, $spine));
        $zip->close();

        $path = "book-epubs/{$book->key_book}/".Str::slug($settings['metadata']['title'] ?: $book->name).'.epub';
        Storage::disk('public')->put($path, file_get_contents($temporary));
        @unlink($temporary);

        return $path;
    }

    private function chapters(iterable $blocks, string $breakMode): array
    {
        $chapters = []; $current = null;
        foreach ($blocks as $block) {
            $text = trim((string) $block->text_plain);
            if ($text === '') continue;
            $isChapter = $breakMode === 'heading' && in_array($block->type, ['chapter', 'chapter_title', 'heading'], true);
            if (! $current || $isChapter) {
                if ($current) $chapters[] = $current;
                $current = ['title' => $isChapter ? $text : 'Chapter '.(count($chapters) + 1), 'paragraphs' => $isChapter ? [] : [$text]];
            } elseif ($block->type !== 'chapter_title') {
                $current['paragraphs'][] = $text;
            }
        }
        if ($current) $chapters[] = $current;
        return $chapters ?: [['title' => 'Book', 'paragraphs' => ['No manuscript content has been added yet.']]];
    }

    private function cover(Book $book): ?array
    {
        $url = (string) $book->cover_img;
        $prefix = Storage::disk('public')->url('');
        if ($url === '' || ! str_starts_with(parse_url($url, PHP_URL_PATH) ?: $url, $prefix)) return null;
        $path = ltrim(substr(parse_url($url, PHP_URL_PATH) ?: $url, strlen($prefix)), '/');
        if (! Storage::disk('public')->exists($path)) return null;
        $contents = Storage::disk('public')->get($path);
        $mime = Storage::disk('public')->mimeType($path) ?: 'image/jpeg';
        $extension = match ($mime) { 'image/png' => 'png', 'image/webp' => 'webp', default => 'jpg' };
        return compact('contents', 'mime', 'extension');
    }

    private function stylesheet(Book $book): string
    {
        $body = $book->book_design_json['styles']['body'] ?? [];
        $font = str_replace(['"', "'"], '', (string) ($body['font_family'] ?? 'serif'));
        $size = max(10, min(28, (float) ($body['font_size'] ?? 18)));
        $lineHeight = max(1, min(2.5, (float) ($body['line_height'] ?? 1.6)));
        $color = preg_match('/^#[0-9a-fA-F]{6}$/', $body['color'] ?? '') ? $body['color'] : '#182033';
        return "body { margin: 5%; font-family: '{$font}', serif; font-size: {$size}px; line-height: {$lineHeight}; color: {$color}; } h1 { margin: 0 0 1.8em; page-break-before: always; } p { margin: 0 0 1em; } .title-page { text-align: center; margin-top: 28%; } .cover { max-width: 100%; max-height: 100%; }";
    }

    private function containerDocument(): string
    {
        return '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>';
    }

    private function titlePage(array $settings, ?array $cover): string
    {
        $title = $this->escape($settings['metadata']['title']); $subtitle = $this->escape($settings['metadata']['subtitle']); $author = $this->escape($settings['metadata']['author']);
        $image = $cover ? '<img class="cover" src="../images/cover.'.$cover['extension'].'" alt="Cover"/>' : '';
        return $this->xhtml("<section class=\"title-page\">{$image}<h1>{$title}</h1>".($subtitle ? "<p>{$subtitle}</p>" : '').($author ? "<p>{$author}</p>" : '').'</section>');
    }

    private function chapterDocument(string $title, array $paragraphs): string
    {
        return $this->xhtml('<section><h1>'.$this->escape($title).'</h1>'.collect($paragraphs)->map(fn ($paragraph) => '<p>'.$this->escape($paragraph).'</p>')->implode('').'</section>');
    }

    private function navigation(array $settings, array $chapters): string
    {
        $items = collect($chapters)->map(fn ($chapter, $index) => '<li><a href="text/chapter-'.($index + 1).'.xhtml">'.$this->escape($chapter['title']).'</a></li>')->implode('');
        return $this->xhtml('<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>'.$items.'</ol></nav>', true);
    }

    private function packageDocument(array $settings, string $identifier, array $manifest, array $spine): string
    {
        $meta = $settings['metadata'];
        $manifestXml = collect($manifest)->map(fn ($item) => '<item id="'.$item['id'].'" href="'.$item['href'].'" media-type="'.$item['media'].'"'.(isset($item['properties']) ? ' properties="'.$item['properties'].'"' : '').'/>')->implode('');
        $spineXml = collect($spine)->map(fn ($id) => '<itemref idref="'.$id.'"/>')->implode('');
        $subjects = collect($meta['subjects'] ?? [])->filter()->map(fn ($subject) => '<dc:subject>'.$this->escape($subject).'</dc:subject>')->implode('');
        $direction = $settings['reading']['direction'] === 'auto'
            ? (in_array($meta['language'], ['ar', 'he', 'fa', 'ur'], true) ? 'rtl' : 'ltr')
            : $settings['reading']['direction'];
        return '<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="'.$this->escape($meta['language']).'"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">'.$this->escape($identifier).'</dc:identifier><dc:title>'.$this->escape($meta['title']).'</dc:title><dc:language>'.$this->escape($meta['language']).'</dc:language><meta property="dcterms:modified">'.now()->utc()->format('Y-m-d\\TH:i:s\\Z').'</meta>'.($meta['author'] ? '<dc:creator>'.$this->escape($meta['author']).'</dc:creator>' : '').($meta['publisher'] ? '<dc:publisher>'.$this->escape($meta['publisher']).'</dc:publisher>' : '').($meta['publication_date'] ? '<dc:date>'.$this->escape($meta['publication_date']).'</dc:date>' : '').($meta['description'] ? '<dc:description>'.$this->escape($meta['description']).'</dc:description>' : '').($meta['rights'] ? '<dc:rights>'.$this->escape($meta['rights']).'</dc:rights>' : '').$subjects.'</metadata><manifest>'.$manifestXml.'</manifest><spine page-progression-direction="'.$direction.'">'.$spineXml.'</spine></package>';
    }

    private function xhtml(string $content, bool $navigation = false): string
    {
        $namespace = $navigation ? ' xmlns:epub="http://www.idpf.org/2007/ops"' : '';
        return '<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"'.$namespace.'><head><title>Book</title><link rel="stylesheet" type="text/css" href="'.($navigation ? 'styles/book.css' : '../styles/book.css').'"/></head><body>'.$content.'</body></html>';
    }

    private function escape(?string $value): string { return htmlspecialchars((string) $value, ENT_XML1 | ENT_QUOTES, 'UTF-8'); }
}
