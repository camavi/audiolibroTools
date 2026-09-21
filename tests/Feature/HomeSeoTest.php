<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class HomeSeoTest extends TestCase
{
    use RefreshDatabase;

    public function test_home_exposes_canonical_and_social_metadata(): void
    {
        $this->get('/en')
            ->assertOk()
            ->assertSee('name="description"', false)
            ->assertSee('property="og:title"', false)
            ->assertSee('name="twitter:card"', false)
            ->assertSee('assets/images/favicon.svg', false);
    }

    public function test_robots_and_sitemap_are_available(): void
    {
        $this->get('/robots.txt')
            ->assertOk()
            ->assertHeader('Content-Type', 'text/plain; charset=UTF-8')
            ->assertSee('Disallow: /dashboard')
            ->assertSee('Sitemap: '.url('/sitemap.xml'));

        $this->get('/sitemap.xml')
            ->assertOk()
            ->assertHeader('Content-Type', 'application/xml; charset=UTF-8')
            ->assertSee('<urlset', false)
            ->assertSee(url('/en'))
            ->assertSee(url('/it'));
    }
}
