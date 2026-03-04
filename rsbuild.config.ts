import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/rspack';

const appUrl = (process.env.APP_URL || 'https://simversity.org').replace(
  /\/+$/,
  '',
);

export default defineConfig({
  plugins: [pluginReact()],
  html: {
    title: 'Simversity',
    meta: {
      description:
        'AI-powered teaching simulator for practicing responses to student misconceptions',
    },
    templateParameters: {
      htmlLang: 'en',
    },
    tags: [
      {
        tag: 'link',
        attrs: { rel: 'canonical', href: appUrl },
        head: true,
      },
      {
        tag: 'meta',
        attrs: { property: 'og:site_name', content: 'Simversity' },
        head: true,
      },
      {
        tag: 'link',
        attrs: { rel: 'icon', type: 'image/png', href: '/favicon.png' },
        head: true,
      },
      {
        tag: 'meta',
        attrs: { property: 'og:title', content: 'Simversity' },
        head: true,
      },
      {
        tag: 'meta',
        attrs: {
          property: 'og:description',
          content:
            'AI-powered teaching simulator for practicing responses to student misconceptions',
        },
        head: true,
      },
      {
        tag: 'meta',
        attrs: { property: 'og:type', content: 'website' },
        head: true,
      },
      {
        tag: 'meta',
        attrs: {
          property: 'og:image',
          content: `${appUrl}/og-image.jpg`,
        },
        head: true,
      },
      {
        tag: 'meta',
        attrs: {
          property: 'og:url',
          content: appUrl,
        },
        head: true,
      },
      {
        tag: 'meta',
        attrs: { name: 'twitter:card', content: 'summary_large_image' },
        head: true,
      },
      {
        tag: 'meta',
        attrs: { name: 'twitter:title', content: 'Simversity' },
        head: true,
      },
      {
        tag: 'meta',
        attrs: {
          name: 'twitter:description',
          content:
            'AI-powered teaching simulator for practicing responses to student misconceptions',
        },
        head: true,
      },
      {
        tag: 'meta',
        attrs: {
          name: 'twitter:image',
          content: `${appUrl}/og-image.jpg`,
        },
        head: true,
      },
      {
        tag: 'link',
        attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        head: true,
      },
      {
        tag: 'link',
        attrs: {
          rel: 'preconnect',
          href: 'https://fonts.gstatic.com',
          crossorigin: '',
        },
        head: true,
      },
      {
        tag: 'link',
        attrs: {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&display=swap',
        },
        head: true,
      },
    ],
  },
  resolve: {
    alias: {
      '@': './src',
    },
  },
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  performance: {
    chunkSplit: {
      strategy: 'split-by-experience',
    },
  },
  tools: {
    rspack: {
      plugins: [
        tanstackRouter({
          target: 'react',
          autoCodeSplitting: true,
        }),
      ],
    },
  },
});
