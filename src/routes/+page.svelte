<script lang="ts">
  import {
    Accordion,
    AccordionItem,
    getToastStore,
  } from "@skeletonlabs/skeleton";
  import type { ToastSettings } from "@skeletonlabs/skeleton";
  import { onMount } from "svelte";

  let url = "";
  let format = "";
  let filename = "";
  let locationName = "";
  let isPlaylist = false;
  let audioOnly = false;
  let audioFormat = "mp3";
  let maxResolution = "";
  let embedMetadata = true;
  let embedThumbnail = true;
  let locations: string[] = [];
  let loading = false;
  let result = "";
  let error = "";

  onMount(async () => {
    try {
      const response = await fetch("/api/config");
      const data = await response.json();
      if (data.locations) {
        locations = data.locations;
        locationName = locations[0];
      }
    } catch (e) {
      console.error("Failed to load locations", e);
    }
  });

  async function handleDownload() {
    loading = true;
    result = "";
    error = "";

    try {
      const response = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          options: {
            format,
            filename,
            locationName,
            isPlaylist,
            audioOnly,
            audioFormat,
            maxResolution,
            embedMetadata,
            embedThumbnail,
            advanced: true,
          },
        }),
      });

      const data = await response.json();
      if (response.ok) {
        result = data.stdout || "Success!";
      } else {
        error = data.error || "Something went wrong";
      }
    } catch (e) {
      error = "Failed to connect to server";
    } finally {
      loading = false;
    }
  }
</script>

<div class="container h-full mx-auto flex justify-center items-center">
  <div class="space-y-8 w-full max-w-2xl p-4">
    <header class="text-center">
      <h1 class="h1">yt-dlp Web Interface</h1>
      <p>Enter a URL to download video or audio.</p>
    </header>

    <div class="card p-4 space-y-4 shadow-xl">
      <label class="label">
        <span>Video URL</span>
        <input
          class="input"
          type="url"
          bind:value={url}
          placeholder="https://www.youtube.com/watch?v=..."
        />
      </label>

      <label class="flex items-center space-x-2">
        <input class="checkbox" type="checkbox" bind:checked={isPlaylist} />
        <p>Download as Playlist</p>
      </label>

      {#if locations.length > 0}
        <label class="label">
          <span>Download Location</span>
          <select class="select" bind:value={locationName}>
            {#each locations as loc}
              <option value={loc}>{loc}</option>
            {/each}
          </select>
        </label>
      {/if}

      <Accordion>
        <AccordionItem>
          <svelte:fragment slot="summary">Advanced Options</svelte:fragment>
          <svelte:fragment slot="content">
            <div class="space-y-4">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label class="flex items-center space-x-2">
                  <input
                    class="checkbox"
                    type="checkbox"
                    bind:checked={audioOnly}
                  />
                  <p>Audio Only</p>
                </label>
                {#if audioOnly}
                  <label class="label">
                    <span>Audio Format</span>
                    <select class="select" bind:value={audioFormat}>
                      <option value="mp3">MP3</option>
                      <option value="m4a">M4A</option>
                      <option value="opus">Opus</option>
                      <option value="wav">WAV</option>
                    </select>
                  </label>
                {/if}
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label class="flex items-center space-x-2">
                  <input
                    class="checkbox"
                    type="checkbox"
                    bind:checked={embedMetadata}
                  />
                  <p>Embed Metadata</p>
                </label>
                <label class="flex items-center space-x-2">
                  <input
                    class="checkbox"
                    type="checkbox"
                    bind:checked={embedThumbnail}
                  />
                  <p>Embed Thumbnail</p>
                </label>
              </div>

              <label class="label">
                <span>Max Resolution</span>
                <select
                  class="select"
                  bind:value={maxResolution}
                  disabled={audioOnly}
                >
                  <option value="">Best Available</option>
                  <option value="2160">4K (2160p)</option>
                  <option value="1440">2K (1440p)</option>
                  <option value="1080">1080p</option>
                  <option value="720">720p</option>
                  <option value="480">480p</option>
                </select>
              </label>

              <label class="label">
                <span>Format Selection</span>
                <select class="select" bind:value={format}>
                  <option value="">Default (Best)</option>
                  <option value="bestvideo+bestaudio/best"
                    >Best Video + Best Audio</option
                  >
                  <option value="bestaudio/best">Best Audio Only</option>
                  <option value="mp4">MP4</option>
                  <option value="webm">WebM</option>
                </select>
              </label>
              <label class="label">
                <span>Custom Format String (overrides selection)</span>
                <input
                  class="input"
                  type="text"
                  bind:value={format}
                  placeholder="e.g. 137+140"
                />
              </label>
              <label class="label">
                <span>Custom Filename (optional)</span>
                <input
                  class="input"
                  type="text"
                  bind:value={filename}
                  placeholder="%(title)s.%(ext)s"
                />
              </label>
            </div>
          </svelte:fragment>
        </AccordionItem>
      </Accordion>

      <button
        class="btn variant-filled-primary w-full"
        on:click={handleDownload}
        disabled={loading || !url}
      >
        {#if loading}
          <span>Downloading...</span>
        {:else}
          <span>Download</span>
        {/if}
      </button>
    </div>

    {#if result}
      <div class="card p-4 variant-soft-success overflow-auto max-h-64">
        <pre class="text-xs">{result}</pre>
      </div>
    {/if}

    {#if error}
      <div class="card p-4 variant-soft-error">
        <p>{error}</p>
      </div>
    {/if}
  </div>
</div>
