<script lang="ts">
  import {
    Accordion,
    AccordionItem,
    getToastStore,
    ProgressBar,
  } from "@skeletonlabs/skeleton";
  import type { ToastSettings } from "@skeletonlabs/skeleton";
  import { onMount, onDestroy } from "svelte";

  let urlInput = "";
  let format = "";
  let filename = "";
  let locationName = "";
  let isPlaylist = false;
  let audioOnly = false;
  let audioFormat = "mp3";
  let maxResolution = "";
  let embedMetadata = true;
  let embedThumbnail = true;
  let force = false;
  let locations: string[] = [];
  let loading = false;
  let error = "";

  let queue: any = { active: null, pending: [], completed: [] };
  let pollInterval: any;

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

    fetchQueue();
    pollInterval = setInterval(fetchQueue, 2000);
  });

  onDestroy(() => {
    if (pollInterval) clearInterval(pollInterval);
  });

  async function fetchQueue() {
    try {
      const response = await fetch("/api/queue");
      queue = await response.json();
    } catch (e) {
      console.error("Failed to fetch queue", e);
    }
  }

  async function handleDownload() {
    loading = true;
    error = "";

    const urls = urlInput
      .split("\n")
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    if (urls.length === 0) {
      error = "Please enter at least one URL";
      loading = false;
      return;
    }

    try {
      const response = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls,
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
            force,
            advanced: true,
          },
        }),
      });

      const data = await response.json();
      if (response.ok) {
        urlInput = "";
        fetchQueue();
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

<div class="container h-full mx-auto p-4 space-y-8">
  <header class="text-center">
    <h1 class="h1">yt-dlp Web Interface</h1>
    <p>Enter one or more URLs (one per line) to download.</p>
  </header>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
    <!-- Input Section -->
    <div class="card p-4 space-y-4 shadow-xl h-fit">
      <label class="label">
        <span>Video URLs (one per line)</span>
        <textarea
          class="textarea"
          rows="4"
          bind:value={urlInput}
          placeholder="https://www.youtube.com/watch?v=..."
        ></textarea>
      </label>

      <label class="flex items-center space-x-2">
        <input class="checkbox" type="checkbox" bind:checked={isPlaylist} />
        <p>Download as Playlist</p>
      </label>

      <label class="flex items-center space-x-2">
        <input class="checkbox" type="checkbox" bind:checked={force} />
        <p>Force re-download (ignore history)</p>
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
        disabled={loading || !urlInput}
      >
        {#if loading}
          <span>Adding to Queue...</span>
        {:else}
          <span>Add to Queue</span>
        {/if}
      </button>

      {#if error}
        <div class="card p-4 variant-soft-error">
          <p>{error}</p>
        </div>
      {/if}
    </div>

    <!-- Queue Section -->
    <div class="space-y-4">
      <h2 class="h2">Download Queue</h2>

      {#if queue.active}
        <div class="card p-4 variant-soft-primary space-y-2">
          <div class="flex justify-between items-center">
            <span class="font-bold">Active: {queue.active.url}</span>
            <span>{queue.active.progress}</span>
          </div>
          <ProgressBar value={parseFloat(queue.active.progress)} max={100}
          ></ProgressBar>
        </div>
      {/if}

      {#if queue.pending.length > 0}
        <div class="card p-4 space-y-2">
          <h3 class="h3">Pending ({queue.pending.length})</h3>
          <ul class="list">
            {#each queue.pending as task}
              <li class="text-sm truncate opacity-75">{task.url}</li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if queue.completed.length > 0}
        <div class="card p-4 space-y-2">
          <h3 class="h3">Recent Activity</h3>
          <ul class="list">
            {#each queue.completed as task}
              <li class="flex justify-between items-center text-sm">
                <span class="truncate flex-1">{task.url}</span>
                <span
                  class="badge {task.status === 'completed'
                    ? 'variant-filled-success'
                    : task.status === 'skipped'
                      ? 'variant-filled-warning'
                      : 'variant-filled-error'}"
                >
                  {task.status}
                </span>
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if !queue.active && queue.pending.length === 0 && queue.completed.length === 0}
        <div class="card p-8 text-center opacity-50">
          <p>Queue is empty</p>
        </div>
      {/if}
    </div>
  </div>
</div>
