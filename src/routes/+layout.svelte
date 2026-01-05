<script lang="ts">
  import "../app.postcss";
  import { AppShell, AppBar } from "@skeletonlabs/skeleton";
</script>

<AppShell>
  <svelte:fragment slot="header">
    <AppBar>
      <strong class="text-xl uppercase">yt-dlp WebUI</strong>
    </AppBar>
  </svelte:fragment>
  <slot />
</AppShell>
