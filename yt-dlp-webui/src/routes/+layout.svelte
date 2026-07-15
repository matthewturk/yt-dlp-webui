<script lang="ts">
  import "../app.postcss";
  import {
    AppShell,
    AppBar,
    Toast,
    Modal,
    initializeStores,
  } from "@skeletonlabs/skeleton";

  initializeStores();
</script>

<Toast />
<Modal />

<AppShell>
  <svelte:fragment slot="header">
    <AppBar
      gridColumns="grid-cols-3"
      slotDefault="place-self-center"
      slotTrail="place-content-end"
    >
      <svelte:fragment slot="lead">
        <div class="flex items-center space-x-4">
          <a href="/" class="text-xl uppercase tracking-widest hover:text-primary-400 transition-colors"><strong>yt-dlp</strong></a>
        </div>
      </svelte:fragment>
      <div class="font-bold text-surface-500-400-token">Web Interface</div>
      <svelte:fragment slot="trail">
        <a
          class="btn btn-sm variant-ghost-surface"
          href="/podcasts"
        >
          Podcasts
        </a>
        <a
          class="btn btn-sm variant-ghost-surface"
          href="https://github.com/matthewturk/yt-dlp-webui"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </svelte:fragment>
    </AppBar>
  </svelte:fragment>

  <div class="container mx-auto p-4 md:p-10">
    <slot />
  </div>
</AppShell>
