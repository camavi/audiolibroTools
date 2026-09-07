<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use InvalidArgumentException;
use PhpOffice\PhpWord\Element\ListItem;
use PhpOffice\PhpWord\Element\Text;
use PhpOffice\PhpWord\Element\TextRun;
use PhpOffice\PhpWord\Element\Title;
use PhpOffice\PhpWord\IOFactory as WordIOFactory;
use Smalot\PdfParser\Parser;

class ManuscriptImportService
{
    /**
     * @return array<int, array{type: string, text_plain: string, content_json: array<string, mixed>}>
     */
    public function blocksFor(UploadedFile $file): array
    {
        $extension = strtolower($file->getClientOriginalExtension());

        if ($extension === 'docx') {
            return $this->docxBlocks($file);
        }

        $text = match ($extension) {
            'txt' => $this->textFileContents($file),
            'pdf' => $this->pdfContents($file),
            default => throw new InvalidArgumentException('Only TXT, DOCX and text-based PDF manuscripts are supported.'),
        };

        $blocks = [];
        foreach ($this->sections($this->normalize($text)) as $part) {
            $part = trim($part);
            if ($part === '') {
                continue;
            }

            [$type, $text] = $this->blockTypeAndText($part);
            if ($text === '') {
                continue;
            }

            $blocks[] = [
                'type' => $type,
                'text_plain' => $text,
                'content_json' => [
                    'type' => $type,
                    'content' => [['type' => 'text', 'text' => $text]],
                ],
            ];
        }

        if ($blocks === []) {
            throw new InvalidArgumentException('No readable manuscript text was found. Scanned PDFs need OCR before import.');
        }

        return $blocks;
    }

    private function textFileContents(UploadedFile $file): string
    {
        $contents = file_get_contents($file->getRealPath());
        if ($contents === false) {
            throw new InvalidArgumentException('The manuscript could not be read.');
        }

        $encoding = mb_detect_encoding($contents, ['UTF-8', 'Windows-1252', 'ISO-8859-1'], true) ?: 'UTF-8';

        return mb_convert_encoding($contents, 'UTF-8', $encoding);
    }

    private function pdfContents(UploadedFile $file): string
    {
        try {
            return (new Parser)->parseFile($file->getRealPath())->getText();
        } catch (\Throwable $exception) {
            throw new InvalidArgumentException('The PDF could not be read. Upload a text-based PDF or export it with OCR.', previous: $exception);
        }
    }

    /** @return array<int, array{type: string, text_plain: string, content_json: array<string, mixed>}> */
    private function docxBlocks(UploadedFile $file): array
    {
        try {
            $document = WordIOFactory::load($file->getRealPath());
        } catch (\Throwable $exception) {
            throw new InvalidArgumentException('The DOCX could not be read. Open it in Word and save it again before importing.', previous: $exception);
        }

        $blocks = [];
        foreach ($document->getSections() as $section) {
            foreach ($section->getElements() as $element) {
                $text = $this->docxElementText($element);
                if ($text === '') {
                    continue;
                }
                $type = $element instanceof Title || $this->docxStyleIsHeading($element) ? 'heading' : 'paragraph';
                $blocks[] = $this->makeBlock($type, $text);
            }
        }

        if ($blocks === []) {
            throw new InvalidArgumentException('No readable manuscript text was found in this DOCX.');
        }

        return $blocks;
    }

    private function docxElementText(mixed $element): string
    {
        if (! $element instanceof Text && ! $element instanceof TextRun && ! $element instanceof Title && ! $element instanceof ListItem) {
            return '';
        }
        $text = $element->getText();
        if ($text instanceof TextRun) {
            $text = $text->getText();
        }

        return $this->normalize(is_string($text) ? $text : '');
    }

    private function docxStyleIsHeading(mixed $element): bool
    {
        if (! method_exists($element, 'getParagraphStyle')) {
            return false;
        }
        $style = $element->getParagraphStyle();
        $name = is_string($style)
            ? $style
            : (method_exists($style, 'getStyleName') ? $style->getStyleName() : (method_exists($style, 'getName') ? $style->getName() : ''));

        return is_string($name) && str_starts_with(strtolower(str_replace(['_', ' '], '', $name)), 'heading');
    }

    /** @return array{type: string, text_plain: string, content_json: array<string, mixed>} */
    private function makeBlock(string $type, string $text): array
    {
        return [
            'type' => $type,
            'text_plain' => $text,
            'content_json' => [
                'type' => $type,
                'content' => [['type' => 'text', 'text' => $text]],
            ],
        ];
    }

    private function normalize(string $text): string
    {
        $text = str_replace(["\r\n", "\r", "\u{00A0}"], ["\n", "\n", ' '], $text);
        $text = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u', '', $text) ?? $text;

        return trim(preg_replace('/\\n{3,}/', "\n\n", $text) ?? $text);
    }

    /** @return array{string, string} */
    private function blockTypeAndText(string $text): array
    {
        if (preg_match('/^#{1,6}\\s+(.+)$/u', $text, $matches)) {
            return ['heading', trim($matches[1])];
        }

        $lines = preg_split('/\\n/u', $text) ?: [];
        $firstLine = trim((string) array_shift($lines));
        if ($this->looksLikeHeading($firstLine)) {
            return ['heading', $firstLine];
        }

        $text = preg_replace('/[\\t ]*\\n[\\t ]*/u', ' ', $text) ?? $text;
        $text = preg_replace('/[\\t ]{2,}/u', ' ', $text) ?? $text;

        return ['paragraph', trim($text)];
    }

    /** @return array<int, string> */
    private function sections(string $text): array
    {
        $sections = preg_split('/\\n[\\t ]*\\n+/u', $text) ?: [];
        $expanded = [];

        foreach ($sections as $section) {
            $lines = preg_split('/\\n/u', trim($section)) ?: [];
            if (count($lines) > 1 && $this->looksLikeHeading(trim($lines[0]))) {
                $expanded[] = array_shift($lines);
                if (trim(implode("\n", $lines)) !== '') {
                    $expanded[] = implode("\n", $lines);
                }

                continue;
            }
            $expanded[] = $section;
        }

        return $expanded;
    }

    private function looksLikeHeading(string $text): bool
    {
        if ($text === '' || mb_strlen($text) > 100 || preg_match('/[.!?;:]$/u', $text)) {
            return false;
        }

        return (bool) preg_match('/^(?:chapter|capitolo|part|parte)\\s+(?:\\d+|[ivxlcdm]+|[\\p{L}\\p{N}][\\p{L}\\p{N} .-]*)$/iu', $text)
            || ($text === mb_strtoupper($text) && preg_match('/[\\p{L}]/u', $text));
    }
}
