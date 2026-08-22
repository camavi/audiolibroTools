<?php

namespace App\Services;

class BookRichTextRenderer
{
    public function render(array $node, array $options = []): string
    {
        return $this->node($node, $options);
    }

    private function node(array $node, array $options): string
    {
        $type = $node['type'] ?? 'paragraph';
        $attrs = $node['attrs'] ?? [];
        $content = implode('', array_map(fn ($child) => is_array($child) ? $this->node($child, $options) : '', $node['content'] ?? []));

        if ($type === 'text') return $this->marks($this->escape($node['text'] ?? ''), $node['marks'] ?? []);
        if ($type === 'hardBreak') return '<br/>';
        if ($type === 'manuscriptImage') return isset($options['image']) ? (string) ($options['image'])($attrs) : '';
        if ($type === 'horizontalRule') return ($attrs['pageBreak'] ?? false) ? '<div class="page-break"></div>' : '<hr class="scene-break"/>';
        if ($type === 'blockquote') return '<blockquote'.$this->alignment($attrs).'>'.$content.'</blockquote>';
        if ($type === 'bulletList') return '<ul>'.$content.'</ul>';
        if ($type === 'orderedList') return '<ol>'.$content.'</ol>';
        if ($type === 'listItem') return '<li>'.$content.'</li>';
        if ($type === 'heading') return '<h1'.($options['chapter_new_page'] ?? false ? ' class="chapter"' : '').$this->alignment($attrs).'>'.$content.'</h1>';
        if ($type === 'paragraph') return '<p'.$this->alignment($attrs).'>'.$content.'</p>';

        return $content;
    }

    private function marks(string $text, array $marks): string
    {
        foreach ($marks as $mark) {
            $type = $mark['type'] ?? '';
            if ($type === 'bold') $text = '<strong>'.$text.'</strong>';
            if ($type === 'italic') $text = '<em>'.$text.'</em>';
            if ($type === 'underline') $text = '<u>'.$text.'</u>';
            if ($type === 'strike') $text = '<s>'.$text.'</s>';
            if ($type === 'link') {
                $href = $this->link($mark['attrs']['href'] ?? '');
                if ($href) $text = '<a href="'.$this->escape($href).'">'.$text.'</a>';
            }
        }

        return $text;
    }

    private function alignment(array $attrs): string
    {
        $alignment = $attrs['textAlign'] ?? null;
        return in_array($alignment, ['left', 'center', 'right', 'justify'], true) ? ' class="align-'.$alignment.'"' : '';
    }

    private function link(mixed $href): ?string
    {
        $href = trim((string) $href);
        return preg_match('/^(https?:|mailto:|#)/i', $href) ? $href : null;
    }

    private function escape(mixed $value): string
    {
        return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
