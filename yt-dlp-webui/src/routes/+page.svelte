<script lang="ts">
  import {
    Accordion,
    AccordionItem,
    getToastStore,
    ProgressBar,
  } from "@skeletonlabs/skeleton";
  import type { ToastSettings } from "@skeletonlabs/skeleton";
  import { onMount, onDestroy } from "svelte";
  import {
    Download,
    Settings,
    List,
    CheckCircle2,
    XCircle,
    Clock,
    Play,
    Trash2,
    ExternalLink,
    Music,
    Video,
    Info,
    History,
    RefreshCw,
    Ban,
    ChevronDown,
    ChevronUp,
    Terminal,
  } from "lucide-svelte";

  const toastStore = getToastStore();

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
  let alsoDownloadAudio = false;
  let locations: string[] = [];
  let loading = false;
  let error = "";
  let showLogs = false;

  let queue: any = { active: null, pending: [], completed: [] };
  let pollInterval: any;

  const filenameSuggestions = [
    { label: "Default", value: "" },
    { label: "Date - Title", value: "%(upload_date)s - %(title)s.%(ext)s" },
    { label: "Title [ID]", value: "%(title)s [%(id)s].%(ext)s" },
    { label: "Uploader - Title", value: "%(uploader)s - %(title)s.%(ext)s" },
    {
      label: "Playlist Subfolder",
      value: "%(playlist_title)s/%(playlist_index)s - %(title)s.%(ext)s",
    },
  ];

  onMount(async () => {
    try {
      const response = await fetch("api/config");
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
      const response = await fetch("api/queue");
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
      const response = await fetch("api/download", {
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
            alsoDownloadAudio,
            advanced: true,
          },
        }),
      });

      const data = await response.json();
      if (response.ok) {
        urlInput = "";
        const t: ToastSettings = {
          message: `Successfully queued ${urls.length} download(s)`,
          background: "variant-filled-success",
        };
        toastStore.trigger(t);
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

  async function clearHistory() {
    try {
      await fetch("api/queue/clear", { method: "POST" });
      fetchQueue();
      const t: ToastSettings = {
        message: "History cleared",
        background: "variant-filled-surface",
      };
      toastStore.trigger(t);
    } catch (e) {
      console.error("Failed to clear history", e);
    }
  }

  async function cancelTask(id: string) {
    try {
      await fetch("api/queue/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      fetchQueue();
    } catch (e) {
      console.error("Failed to cancel task", e);
    }
  }

  async function removeTask(id: string) {
    try {
      await fetch("api/queue/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      fetchQueue();
    } catch (e) {
      console.error("Failed to remove task", e);
    }
  }
</script>

<div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
  <!-- Left Column: Input & Options -->
  <div class="lg:col-span-7 space-y-6">
    <div class="card p-6 shadow-xl border border-surface-500/10">
      <header class="flex items-center space-x-3 mb-6">
        <div class="p-2 variant-soft-primary rounded-lg">
          <Download size={24} />
        </div>
        <div>
          <h2 class="h2">New Download</h2>
          <p class="text-sm opacity-60">Add URLs to the processing queue</p>
        </div>
      </header>

      <div class="space-y-6">
        <label class="label">
          <span class="flex items-center space-x-2">
            <ExternalLink size={16} />
            <span>Video URLs (one per line)</span>
          </span>
          <textarea
            class="textarea bg-surface-50-940-token border-surface-500/20 focus:border-primary-500 transition-colors"
            rows="5"
            bind:value={urlInput}
            placeholder="https://www.youtube.com/watch?v=..."
          ></textarea>
        </label>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label
            class="card p-4 variant-soft-surface border border-surface-500/10 flex items-center space-x-4 cursor-pointer hover:variant-soft-primary transition-colors"
          >
            <input
              type="checkbox"
              class="form-checkbox w-5 h-5 rounded border-surface-500/30 bg-surface-50-940-token text-primary-500 focus:ring-primary-500"
              bind:checked={isPlaylist}
            />
            <span class="text-sm font-medium">Playlist</span>
          </label>
          <label
            class="card p-4 variant-soft-surface border border-surface-500/10 flex items-center space-x-4 cursor-pointer hover:variant-soft-warning transition-colors"
          >
            <input
              type="checkbox"
              class="form-checkbox w-5 h-5 rounded border-surface-500/30 bg-surface-50-940-token text-warning-500 focus:ring-warning-500"
              bind:checked={force}
            />
            <span class="text-sm font-medium">Force Redownload</span>
          </label>
          <label
            class="card p-4 variant-soft-surface border border-surface-500/10 flex items-center space-x-4 cursor-pointer hover:variant-soft-secondary transition-colors"
            class:opacity-50={audioOnly}
            class:pointer-events-none={audioOnly}
          >
            <input
              type="checkbox"
              class="form-checkbox w-5 h-5 rounded border-surface-500/30 bg-surface-50-940-token text-secondary-500 focus:ring-secondary-500"
              bind:checked={alsoDownloadAudio}
              disabled={audioOnly}
            />
            <span class="text-sm font-medium">Also Download Audio?</span>
          </label>
        </div>

        {#if locations.length > 0}
          <label class="label">
            <span class="flex items-center space-x-2">
              <List size={16} />
              <span>Download Location</span>
            </span>
            <select class="select" bind:value={locationName}>
              {#each locations as loc}
                <option value={loc}>{loc}</option>
              {/each}
            </select>
          </label>
        {/if}

        <Accordion
          class="card variant-soft-surface border border-surface-500/10 overflow-hidden"
        >
          <AccordionItem>
            <svelte:fragment slot="lead"><Settings size={20} /></svelte:fragment
            >
            <svelte:fragment slot="summary">
              <span class="font-bold">Advanced Configuration</span>
            </svelte:fragment>
            <svelte:fragment slot="content">
              <div class="space-y-6 pt-2">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div class="space-y-4">
                    <label class="flex items-center space-x-3 cursor-pointer">
                      <input
                        class="form-checkbox w-5 h-5 rounded border-surface-500/30 bg-surface-50-940-token text-primary-500 focus:ring-primary-500"
                        type="checkbox"
                        bind:checked={audioOnly}
                      />
                      <span class="flex items-center space-x-2">
                        <Music size={16} />
                        <span>Audio Only</span>
                      </span>
                    </label>
                    {#if audioOnly}
                      <label class="label pl-7">
                        <span class="text-xs opacity-60">Format</span>
                        <select
                          class="select select-sm"
                          bind:value={audioFormat}
                        >
                          <option value="mp3">MP3</option>
                          <option value="m4a">M4A</option>
                          <option value="opus">Opus</option>
                          <option value="wav">WAV</option>
                        </select>
                      </label>
                    {/if}
                  </div>

                  <div class="space-y-4">
                    <label class="flex items-center space-x-3 cursor-pointer">
                      <input
                        class="form-checkbox w-5 h-5 rounded border-surface-500/30 bg-surface-50-940-token text-primary-500 focus:ring-primary-500"
                        type="checkbox"
                        bind:checked={embedMetadata}
                      />
                      <span class="flex items-center space-x-2">
                        <Info size={16} />
                        <span>Embed Metadata</span>
                      </span>
                    </label>
                    <label class="flex items-center space-x-3 cursor-pointer">
                      <input
                        class="form-checkbox w-5 h-5 rounded border-surface-500/30 bg-surface-50-940-token text-primary-500 focus:ring-primary-500"
                        type="checkbox"
                        bind:checked={embedThumbnail}
                      />
                      <span class="flex items-center space-x-2">
                        <Video size={16} />
                        <span>Embed Thumbnail</span>
                      </span>
                    </label>
                  </div>
                </div>

                <div class="divider opacity-10"></div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label class="label">
                    <span class="text-xs opacity-60">Max Resolution</span>
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
                    <span class="text-xs opacity-60">Format Selection</span>
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
                </div>

                <label class="label">
                  <span class="text-xs opacity-60"
                    >Custom Filename Template</span
                  >
                  <div class="space-y-2">
                    <input
                      class="input"
                      type="text"
                      bind:value={filename}
                      placeholder="%(title)s.%(ext)s"
                    />
                    <div class="flex flex-wrap gap-2">
                      {#each filenameSuggestions as suggestion}
                        <button
                          type="button"
                          class="btn btn-xs variant-soft-primary"
                          on:click={() => (filename = suggestion.value)}
                        >
                          {suggestion.label}
                        </button>
                      {/each}
                    </div>
                  </div>
                </label>
              </div>
            </svelte:fragment>
          </AccordionItem>
        </Accordion>

        <button
          class="btn variant-filled-primary w-full py-4 font-bold shadow-lg hover:scale-[1.01] active:scale-[0.99] transition-all"
          on:click={handleDownload}
          disabled={loading || !urlInput}
        >
          {#if loading}
            <RefreshCw class="animate-spin mr-2" size={20} />
            <span>Processing...</span>
          {:else}
            <Play class="mr-2" size={20} />
            <span>Start Download</span>
          {/if}
        </button>

        {#if error}
          <div
            class="card p-4 variant-soft-error border border-error-500/20 flex items-center space-x-3"
          >
            <XCircle size={20} />
            <p>{error}</p>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Right Column: Queue & History -->
  <div class="lg:col-span-5 space-y-6">
    <!-- Active Task -->
    <div class="card p-6 shadow-xl border border-surface-500/10">
      <header class="flex justify-between items-center mb-6">
        <div class="flex items-center space-x-3">
          <div class="p-2 variant-soft-secondary rounded-lg">
            <RefreshCw size={20} class={queue.active ? "animate-spin" : ""} />
          </div>
          <h3 class="h3">Active Task</h3>
        </div>
      </header>

      {#if queue.active}
        <div class="space-y-4">
          <div class="flex flex-col space-y-1">
            <div class="flex justify-between items-start">
              <span class="text-sm font-bold truncate flex-1 mr-2"
                >{queue.active.url}</span
              >
              <button
                class="btn btn-xs variant-soft-error"
                title="Cancel Download"
                on:click={() => cancelTask(queue.active.id)}
              >
                <Ban size={14} />
              </button>
            </div>
            <div class="flex justify-between text-xs opacity-60">
              <span>Downloading...</span>
              <span>{queue.active.progress}</span>
            </div>
          </div>
          <ProgressBar
            value={parseFloat(queue.active.progress)}
            max={100}
            meter="variant-filled-secondary"
            track="variant-soft-secondary"
          />

          <!-- Logs Section -->
          <div class="pt-2">
            <button
              class="btn btn-xs variant-soft-surface w-full flex justify-between items-center"
              on:click={() => (showLogs = !showLogs)}
            >
              <span class="flex items-center space-x-2">
                <Terminal size={12} />
                <span>Live Logs</span>
              </span>
              {#if showLogs}
                <ChevronUp size={12} />
              {:else}
                <ChevronDown size={12} />
              {/if}
            </button>

            {#if showLogs}
              <div
                class="mt-2 p-2 bg-black/80 rounded-lg font-mono text-[10px] text-green-400 overflow-y-auto max-h-[200px] border border-surface-500/20"
              >
                {#each queue.active.logs as log}
                  <div
                    class="whitespace-pre-wrap break-all border-b border-white/5 pb-1 mb-1"
                  >
                    {log}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      {:else}
        <div
          class="p-8 text-center opacity-40 border-2 border-dashed border-surface-500/20 rounded-xl"
        >
          <p class="text-sm italic">No active downloads</p>
        </div>
      {/if}
    </div>

    <!-- Pending Queue -->
    <div class="card p-6 shadow-xl border border-surface-500/10">
      <header class="flex items-center space-x-3 mb-6">
        <div class="p-2 variant-soft-surface rounded-lg">
          <Clock size={20} />
        </div>
        <h3 class="h3">Pending Queue ({queue.pending.length})</h3>
      </header>

      {#if queue.pending.length > 0}
        <div class="space-y-2 max-h-[200px] overflow-y-auto pr-2">
          {#each queue.pending as task}
            <div
              class="p-3 variant-soft-surface rounded-lg text-xs flex justify-between items-center border border-surface-500/5 group"
            >
              <span class="truncate mr-2">{task.url}</span>
              <button
                class="opacity-0 group-hover:opacity-100 btn btn-xs variant-soft-error transition-opacity"
                on:click={() => removeTask(task.id)}
              >
                <Trash2 size={12} />
              </button>
            </div>
          {/each}
        </div>
      {:else}
        <div class="p-4 text-center opacity-40">
          <p class="text-xs italic">Queue is empty</p>
        </div>
      {/if}
    </div>

    <!-- History -->
    <div class="card p-6 shadow-xl border border-surface-500/10">
      <header class="flex justify-between items-center mb-6">
        <div class="flex items-center space-x-3">
          <div class="p-2 variant-soft-surface rounded-lg">
            <History size={20} />
          </div>
          <h3 class="h3">Recent Activity</h3>
        </div>
        {#if queue.completed.length > 0}
          <button class="btn btn-sm variant-soft-error" on:click={clearHistory}>
            <Trash2 size={14} class="mr-1" />
            <span>Clear</span>
          </button>
        {/if}
      </header>

      {#if queue.completed.length > 0}
        <div class="space-y-3 max-h-[400px] overflow-y-auto pr-2">
          {#each queue.completed as task}
            <div
              class="flex items-center justify-between p-3 variant-soft-surface rounded-lg border border-surface-500/5"
            >
              <div class="flex flex-col min-w-0 mr-4">
                <span class="text-xs font-medium truncate">{task.url}</span>
                {#if task.error}
                  <span class="text-[10px] text-error-500 truncate"
                    >{task.error}</span
                  >
                {/if}
              </div>
              <div class="flex-shrink-0 flex items-center space-x-2">
                {#if task.status === "completed"}
                  <span class="badge variant-filled-success"
                    ><CheckCircle2 size={12} class="mr-1" /> Done</span
                  >
                {:else if task.status === "skipped"}
                  <span class="badge variant-filled-warning"
                    ><Info size={12} class="mr-1" /> Skipped</span
                  >
                {:else if task.status === "cancelled"}
                  <span class="badge variant-filled-surface"
                    ><Ban size={12} class="mr-1" /> Cancelled</span
                  >
                {:else}
                  <span class="badge variant-filled-error"
                    ><XCircle size={12} class="mr-1" /> Failed</span
                  >
                {/if}
                <button
                  class="btn btn-xs variant-soft-error"
                  on:click={() => removeTask(task.id)}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="p-8 text-center opacity-40">
          <p class="text-sm italic">No recent activity</p>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  /* Custom scrollbar for a cleaner look */
  ::-webkit-scrollbar {
    width: 6px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background: rgba(var(--color-surface-500), 0.2);
    border-radius: 10px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: rgba(var(--color-surface-500), 0.4);
  }
</style>
