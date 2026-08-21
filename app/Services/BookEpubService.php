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
        $manuscriptImages = $this->manuscriptImages($blocks);

        $zip->addFromString('OEBPS/styles/book.css', $this->stylesheet($book));
        $manifest[] = ['id' => 'css', 'href' => 'styles/book.css', 'media' => 'text/css'];

        $cover = $this->cover($book);
        if ($cover) {
            $zip->addFromString('OEBPS/images/cover.'.$cover['extension'], $cover['contents']);
            $manifest[] = ['id' => 'cover-image', 'href' => 'images/cover.'.$cover['extension'], 'media' => $cover['mime'], 'properties' => 'cover-image'];
        }

        foreach ($manuscriptImages as $image) {
            $zip->addFromString('OEBPS/images/'.$image['filename'], $image['contents']);
            $manifest[] = ['id' => $image['id'], 'href' => 'images/'.$image['filename'], 'media' => $image['mime']];
        }

        if ($settings['reading']['include_title_page']) {
            $zip->addFromString('OEBPS/text/title-page.xhtml', $this->titlePage($settings, $cover));
            $manifest[] = ['id' => 'title-page', 'href' => 'text/title-page.xhtml', 'media' => 'application/xhtml+xml'];
            $spine[] = 'title-page';
        }

        foreach ($chapters as $index => $chapter) {
            $id = 'chapter-'.($index + 1);
            $zip->addFromString("OEBPS/text/{$id}.xhtml", $this->chapterDocument($chapter['title'], $chapter['entries'], $manuscriptImages));
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
            $node = $block->content_json ?? [];
            $attrs = $node['attrs'] ?? [];
            $text = trim((string) $block->text_plain);
            $isImage = $block->type === 'image' || ($node['type'] ?? null) === 'manuscriptImage';
            $isPageBreak = ($attrs['pageBreak'] ?? false) === true;
            if ($text === '' && !$isImage && !$isPageBreak) continue;
            $isChapter = $breakMode === 'heading' && in_array($block->type, ['chapter', 'chapter_title', 'heading'], true);
            if (! $current || $isChapter) {
                if ($current) $chapters[] = $current;
                $current = ['title' => $isChapter ? $text : 'Chapter '.(count($chapters) + 1), 'entries' => []];
                if (!$isChapter) $current['entries'][] = $this->entry($block);
            } elseif ($block->type !== 'chapter_title') {
                $current['entries'][] = $this->entry($block);
            }
        }
        if ($current) $chapters[] = $current;
        return $chapters ?: [['title' => 'Book', 'entries' => [['type' => 'paragraph', 'text' => 'No manuscript content has been added yet.', 'align' => null]]]];
    }

    private function cover(Book $book): ?array
    {
        $path = $this->publicPath((string) $book->cover_img);
        if (! $path) return null;
        if (! Storage::disk('public')->exists($path)) return null;
        $contents = Storage::disk('public')->get($path);
        $mime = Storage::disk('public')->mimeType($path) ?: 'image/jpeg';
        $extension = match ($mime) { 'image/png' => 'png', 'image/webp' => 'webp', default => 'jpg' };
        return compact('contents', 'mime', 'extension');
    }

    private function entry(BookBlock $block): array
    {
        $node = $block->content_json ?? [];
        $attrs = $node['attrs'] ?? [];
        if (($attrs['pageBreak'] ?? false) === true) return ['type' => 'page_break'];
        if ($block->type === 'image' || ($node['type'] ?? null) === 'manuscriptImage') {
            return ['type' => 'image', 'src' => (string) ($attrs['src'] ?? ''), 'alt' => (string) ($attrs['alt'] ?? '')];
        }
        return ['type' => 'paragraph', 'text' => trim((string) $block->text_plain), 'align' => $attrs['textAlign'] ?? null];
    }

    private function manuscriptImages(iterable $blocks): array
    {
        $images = [];
        foreach ($blocks as $block) {
            $node = $block->content_json ?? [];
            $attrs = $node['attrs'] ?? [];
            $source = (string) ($attrs['src'] ?? '');
            if (($node['type'] ?? null) !== 'manuscriptImage' || $source === '' || isset($images[$source])) continue;

            $path = $this->publicPath($source);
            if (! $path) continue;
            if (!Storage::disk('public')->exists($path)) continue;

            $mime = Storage::disk('public')->mimeType($path) ?: 'image/jpeg';
            $extension = match ($mime) { 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif', default => 'jpg' };
            $images[$source] = [
                'id' => 'manuscript-image-'.(count($images) + 1),
                'source' => $source,
                'filename' => 'manuscript-'.(count($images) + 1).'.'.$extension,
                'mime' => $mime,
                'contents' => Storage::disk('public')->get($path),
            ];
        }

        return array_values($images);
    }

    private function publicPath(string $url): ?string
    {
        if ($url === '') return null;
        $pathUrl = parse_url($url, PHP_URL_PATH) ?: $url;
        $prefixPath = rtrim((string) (parse_url(Storage::disk('public')->url(''), PHP_URL_PATH) ?: Storage::disk('public')->url('')), '/').'/';
        if (!str_starts_with($pathUrl, $prefixPath)) return null;

        return ltrim(substr($pathUrl, strlen($prefixPath)), '/');
    }

    private function stylesheet(Book $book): string
    {
        $body = $book->book_design_json['styles']['body'] ?? [];
        $font = str_replace(['"', "'"], '', (string) ($body['font_family'] ?? 'serif'));
        $size = max(10, min(28, (float) ($body['font_size'] ?? 18)));
        $lineHeight = max(1, min(2.5, (float) ($body['line_height'] ?? 1.6)));
        $color = preg_match('/^#[0-9a-fA-F]{6}$/', $body['color'] ?? '') ? $body['color'] : '#182033';
        return "body { margin: 5%; font-family: '{$font}', serif; font-size: {$size}px; line-height: {$lineHeight}; color: {$color}; } h1 { margin: 0 0 1.8em; page-break-before: always; } p { margin: 0 0 1em; } .align-left { text-align:left; } .align-center { text-align:center; } .align-right { text-align:right; } .align-justify { text-align:justify; } .page-break { break-before: page; page-break-before: always; } figure { margin:1.6em 0; text-align:center; } .manuscript-image { max-width:100%; height:auto; } .title-page { text-align: center; margin-top: 28%; } .cover { max-width: 100%; max-height: 100%; }";
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

    private function chapterDocument(string $title, array $entries, array $images): string
    {
        $bySource = collect($images)->keyBy('source');
        $content = collect($entries)->map(function (array $entry) use ($bySource) {
            if ($entry['type'] === 'page_break') return '<div class="page-break"></div>';
            if ($entry['type'] === 'image') {
                $image = $bySource->get($entry['src']);
                return $image ? '<figure><img class="manuscript-image" src="../images/'.$this->escape($image['filename']).'" alt="'.$this->escape($entry['alt']).'"/></figure>' : '';
            }
            $class = in_array($entry['align'], ['left', 'center', 'right', 'justify'], true) ? ' class="align-'.$entry['align'].'"' : '';
            return '<p'.$class.'>'.$this->escape($entry['text']).'</p>';
        })->implode('');
        return $this->xhtml('<section><h1>'.$this->escape($title).'</h1>'.$content.'</section>');
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
