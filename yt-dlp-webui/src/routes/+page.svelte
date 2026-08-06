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
    Key,
    Shield,
    Subtitles,
    BookOpen,
    FileJson,
    Upload,
  } from "lucide-svelte";

  const toastStore = getToastStore();

  let urlInput = "";
  let format = "";
  let filename = "";
  let locationName = "";
  let isPlaylist = false;
  let audioOnly = false;
  let audioFormat = "";
  let maxResolution = "";
  let embedMetadata = true;
  let enhancedAudioMetadata = true;
  let embedThumbnail = true;
  let embedSubtitles = false;
  let subLanguage = "en";
  let embedChapters = false;
  let outputNameMode: "default" | "custom_title" = "default";
  let outputName = "";
  let sanitizeFilename = true;
  let absMode = false;
  let force = false;
  let alsoDownloadAudio = false;
  let locations: string[] = [];
  let absStableBaseNamesByLocation: Record<string, string[]> = {};
  let absStableBaseNameSuggestions: string[] = [];
  let loading = false;
  let error = "";
  let showLogs = false;
  let showPendingModal = false;
  let showBacklogModal = false;
  let showCookieModal = false;
  let showAuthSection = false;

  let username = "";
  let password = "";

  let cookieSites: Array<{
    domain: string;
    size: number;
    lastModified: string;
  }> = [];
  let cookieTab: "upload" | "paste" = "upload";
  let cookieUploadFile: FileList | null = null;
  let cookiePasteDomain = "";
  let cookiePasteString = "";
  let cookieUploading = false;

  let queue: any = { active: null, pending: [], completed: [] };
  let detailedQueue: any = {
    active: null,
    pending: [],
    completed: [],
    stats: {},
  };
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
      if (data.absStableBaseNamesByLocation) {
        absStableBaseNamesByLocation = data.absStableBaseNamesByLocation;
      }
    } catch (e) {
      console.error("Failed to load locations", e);
    }

    fetchCookieSites();
    fetchQueue();
    pollInterval = setInterval(fetchQueue, 2000);
  });

  onDestroy(() => {
    if (pollInterval) clearInterval(pollInterval);
  });

  $: absStableBaseNameSuggestions =
    absStableBaseNamesByLocation[locationName] || [];

  $: absPodcastModeEnabled = absMode && audioOnly;

  $: if (absPodcastModeEnabled) {
    isPlaylist = false;
  }

  // Reset stale dependent states when parent toggles change
  $: if (audioOnly) {
    alsoDownloadAudio = false;
  }

  $: if (!audioOnly) {
    absMode = false;
  }

  function useStableBaseNameSuggestion(name: string) {
    outputNameMode = "custom_title";
    outputName = name;
  }

  async function fetchQueue() {
    try {
      const response = await fetch("api/queue");
      queue = await response.json();
    } catch (e) {
      console.error("Failed to fetch queue", e);
    }
  }

  async function fetchDetailedQueue() {
    try {
      const response = await fetch("api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeAllCompleted: true }),
      });
      detailedQueue = await response.json();
    } catch (e) {
      console.error("Failed to fetch detailed queue", e);
    }
  }

  async function fetchCookieSites() {
    try {
      const response = await fetch("api/config/cookies");
      const data = await response.json();
      cookieSites = data.sites || [];
    } catch (e) {
      console.error("Failed to fetch cookie sites", e);
    }
  }

  async function uploadSiteCookies() {
    if (!cookieUploadFile || cookieUploadFile.length === 0) return;
    cookieUploading = true;
    try {
      const formData = new FormData();
      formData.append("file", cookieUploadFile[0]);
      if (cookiePasteDomain) {
        formData.append("domain", cookiePasteDomain);
      }
      const response = await fetch("api/config/cookies", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (response.ok) {
        toastStore.trigger({
          message: `Cookies saved for ${data.domain}`,
          background: "variant-filled-success",
        });
        cookieUploadFile = null;
        cookiePasteDomain = "";
        fetchCookieSites();
      } else {
        toastStore.trigger({
          message: data.error || "Failed to upload cookies",
          background: "variant-filled-error",
        });
      }
    } catch (e) {
      toastStore.trigger({
        message: "Failed to connect to server",
        background: "variant-filled-error",
      });
    } finally {
      cookieUploading = false;
    }
  }

  async function pasteSiteCookies() {
    if (!cookiePasteString.trim() || !cookiePasteDomain.trim()) return;
    cookieUploading = true;
    try {
      const response = await fetch("api/config/cookies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: cookiePasteDomain,
          cookieString: cookiePasteString,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        toastStore.trigger({
          message: `Cookies saved for ${data.domain}`,
          background: "variant-filled-success",
        });
        cookiePasteString = "";
        cookiePasteDomain = "";
        fetchCookieSites();
      } else {
        toastStore.trigger({
          message: data.error || "Failed to save cookies",
          background: "variant-filled-error",
        });
      }
    } catch (e) {
      toastStore.trigger({
        message: "Failed to connect to server",
        background: "variant-filled-error",
      });
    } finally {
      cookieUploading = false;
    }
  }

  async function deleteSiteCookies(domain: string) {
    try {
      const response = await fetch("api/config/cookies/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const data = await response.json();
      if (response.ok) {
        toastStore.trigger({
          message: `Cookies removed for ${domain}`,
          background: "variant-filled-surface",
        });
        fetchCookieSites();
      }
    } catch (e) {
      toastStore.trigger({
        message: "Failed to delete cookies",
        background: "variant-filled-error",
      });
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
            enhancedAudioMetadata,
            embedThumbnail,
            embedSubtitles,
            subLanguage: embedSubtitles ? subLanguage : undefined,
            embedChapters,
            outputNameMode,
            outputName,
            sanitizeFilename,
            absMode,
            force,
            alsoDownloadAudio,
            username: username || undefined,
            password: password || undefined,
            advanced: true,
          },
        }),
      });

      const data = await response.json();
      if (response.ok) {
        urlInput = "";
        // Clear credentials after successful submission
        username = "";
        password = "";
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

  async function openPendingModal() {
    await fetchDetailedQueue();
    showPendingModal = true;
  }

  async function openBacklogModal() {
    await fetchDetailedQueue();
    showBacklogModal = true;
  }

  function parseProgress(progress: string): number {
    const val = parseFloat(progress);
    return Number.isFinite(val) ? val : 0;
  }
</script>

<div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
  <!-- Left Column: Input & Options -->
  <div class="lg:col-span-7 space-y-6">
    <div class="card p-6 shadow-xl border border-surface-500/20">
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
            class="textarea bg-surface-50-900-token border-surface-500/20 focus:border-primary-500 transition-colors"
            rows="5"
            bind:value={urlInput}
            placeholder="https://www.youtube.com/watch?v=..."
          ></textarea>
        </label>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label
            class="card p-4 variant-soft-surface border border-surface-500/10 flex items-center space-x-4 cursor-pointer hover:variant-soft-primary transition-colors"
            class:opacity-50={absPodcastModeEnabled}
            class:pointer-events-none={absPodcastModeEnabled}
          >
            <input
              type="checkbox"
              class="form-checkbox w-5 h-5 rounded border-surface-500/30 bg-surface-50-900-token text-primary-500 focus:ring-primary-500"
              bind:checked={isPlaylist}
              disabled={absPodcastModeEnabled}
            />
            <span class="text-sm font-medium">Playlist</span>
          </label>
          <label
            class="card p-4 variant-soft-surface border border-surface-500/10 flex items-center space-x-4 cursor-pointer hover:variant-soft-warning transition-colors"
          >
            <input
              type="checkbox"
              class="form-checkbox w-5 h-5 rounded border-surface-500/30 bg-surface-50-900-token text-warning-500 focus:ring-warning-500"
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
              class="form-checkbox w-5 h-5 rounded border-surface-500/30 bg-surface-50-900-token text-secondary-500 focus:ring-secondary-500"
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
                        class="form-checkbox w-5 h-5 rounded border-surface-500/30 bg-surface-50-900-token text-primary-500 focus:ring-primary-500"
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
                          <option value="">Original (No Transcode)</option>
                          <option value="mp3">MP3</option>
                          <option value="m4a">M4A</option>
                          <option value="opus">Opus</option>
                          <option value="wav">WAV</option>
                        </select>
                        {#if !audioFormat}
                          <span
                            class="text-[10px] opacity-60 pl-7 block mt-1"
                            >Downloads the native audio stream (e.g. M4A/Opus)
                            directly — no conversion, no ffmpeg needed.</span
                          >
                        {/if}
                      </label>
                      <label
                        class="card p-3 variant-soft-tertiary border border-tertiary-500/20 flex items-start space-x-3 cursor-pointer"
                      >
                        <input
                          class="form-checkbox w-5 h-5 mt-0.5 rounded border-surface-500/30 bg-surface-50-900-token text-tertiary-500 focus:ring-tertiary-500"
                          type="checkbox"
                          bind:checked={absMode}
                        />
                        <div>
                          <span class="text-sm font-semibold block"
                            >Audiobookshelf Podcast Mode</span
                          >
                          <span
                            class="text-[10px] opacity-60 leading-snug block mt-0.5"
                            >Organises files into <em>ShowName/episode.ext</em>,
                            writes cover.jpg, and embeds full podcast ID3 tags —
                            ready to drop directly into an ABS podcast library
                            folder.</span
                          >
                        </div>
                      </label>
                    {/if}
                  </div>

                  <div class="space-y-4">
                    <label class="flex items-center space-x-3 cursor-pointer">
                      <input
                        class="form-checkbox w-5 h-5 rounded border-surface-500/30 bg-surface-50-900-token text-primary-500 focus:ring-primary-500"
                        type="checkbox"
                        bind:checked={embedMetadata}
                      />
                      <span class="flex items-center space-x-2">
                        <Info size={16} />
                        <span>Embed Metadata</span>
                      </span>
                    </label>
                    {#if audioOnly}
                      <label
                        class="flex items-center space-x-3 cursor-pointer pl-7"
                      >
                        <input
                          class="form-checkbox w-5 h-5 rounded border-surface-500/30 bg-surface-50-900-token text-primary-500 focus:ring-primary-500"
                          type="checkbox"
                          bind:checked={enhancedAudioMetadata}
                        />
                        <span class="text-sm">Enhanced Audio ID3 Tags</span>
                      </label>
                    {/if}
                    <label class="flex items-center space-x-3 cursor-pointer">
                      <input
                        class="form-checkbox w-5 h-5 rounded border-surface-500/30 bg-surface-50-900-token text-primary-500 focus:ring-primary-500"
                        type="checkbox"
                        bind:checked={embedThumbnail}
                      />
                      <span class="flex items-center space-x-2">
                        <Video size={16} />
                        <span>Embed Thumbnail</span>
                      </span>
                    </label>
                    <label class="flex items-center space-x-3 cursor-pointer">
                      <input
                        class="form-checkbox w-5 h-5 rounded border-surface-500/30 bg-surface-50-900-token text-primary-500 focus:ring-primary-500"
                        type="checkbox"
                        bind:checked={embedSubtitles}
                      />
                      <span class="flex items-center space-x-2">
                        <Subtitles size={16} />
                        <span>Embed Subtitles</span>
                      </span>
                    </label>
                    {#if embedSubtitles}
                      <label class="label pl-7">
                        <span class="text-xs opacity-60"
                          >Subtitle Language(s)</span
                        >
                        <input
                          class="input input-sm"
                          type="text"
                          bind:value={subLanguage}
                          placeholder="en, es, fr (comma-separated)"
                        />
                        <span class="text-[10px] opacity-60"
                          >Use language codes. "all" for all available.</span
                        >
                      </label>
                    {/if}
                    <label class="flex items-center space-x-3 cursor-pointer">
                      <input
                        class="form-checkbox w-5 h-5 rounded border-surface-500/30 bg-surface-50-900-token text-primary-500 focus:ring-primary-500"
                        type="checkbox"
                        bind:checked={embedChapters}
                      />
                      <span class="flex items-center space-x-2">
                        <BookOpen size={16} />
                        <span>Embed Chapters</span>
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
                    <span class="text-xs opacity-60">Format Preference</span>
                    <select class="select" bind:value={format}>
                      <option value="">Automatic (Best Quality)</option>
                      <option value="mp4_compatible"
                        >MP4 — H.264 (Most Compatible)</option
                      >
                      <option value="webm_efficient"
                        >WebM — VP9 (Smaller Files)</option
                      >
                      <option value="mkv_best"
                        >MKV — Any Codec (High Quality)</option
                      >
                      <option value="premuxed"
                        >Pre-muxed (Single File, No Muxing)</option
                      >
                    </select>
                  </label>
                </div>

                {#if !absPodcastModeEnabled && outputNameMode !== "custom_title"}
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
                {/if}

                {#if absPodcastModeEnabled}
                  <span class="text-[10px] opacity-60"
                    >Filename template ignored in ABS mode. Output naming is
                    controlled by stable base name and episode title.</span
                  >
                {/if}

                <div class="divider opacity-10"></div>

                <label class="label">
                  <span class="text-xs opacity-60">Output Name Control</span>
                  <select class="select" bind:value={outputNameMode}>
                    <option value="default"
                      >Use Template/Default Naming</option
                    >
                    <option value="custom_title"
                      >Set a Custom Base Name (safe + stable)</option
                    >
                  </select>
                </label>

                {#if absMode && audioOnly}
                  <div
                    class="card p-3 variant-soft-surface border border-surface-500/10 space-y-2"
                  >
                    <span class="text-xs opacity-60 block"
                      >Existing Stable Base Names in {locationName}</span
                    >
                    {#if absStableBaseNameSuggestions.length > 0}
                      <div class="flex flex-wrap gap-2">
                        {#each absStableBaseNameSuggestions as suggestion}
                          <button
                            type="button"
                            class="btn btn-xs variant-soft-secondary"
                            on:click={() =>
                              useStableBaseNameSuggestion(suggestion)}
                          >
                            {suggestion}
                          </button>
                        {/each}
                      </div>
                    {:else}
                      <span class="text-[10px] opacity-60"
                        >No existing podcast folders found for this location
                        yet.</span
                      >
                    {/if}
                  </div>
                {/if}

                {#if outputNameMode === "custom_title"}
                  <label class="label">
                    <span class="text-xs opacity-60"
                      >{absMode && audioOnly
                        ? "Stable Base Name"
                        : "Custom Output Name"}</span
                    >
                    <input
                      class="input"
                      type="text"
                      bind:value={outputName}
                      placeholder={absMode && audioOnly
                        ? "Podcast Show Name"
                        : "My Download"}
                      list={absMode && audioOnly
                        ? "abs-stable-base-name-options"
                        : undefined}
                    />
                    {#if absMode && audioOnly}
                      <datalist id="abs-stable-base-name-options">
                        {#each absStableBaseNameSuggestions as suggestion}
                          <option value={suggestion}></option>
                        {/each}
                      </datalist>
                    {/if}
                    <span class="text-[10px] opacity-60"
                      >{absMode && audioOnly
                        ? "Select an existing show folder or type a new one. Files append source ID automatically to avoid collisions."
                        : "Files will append the source ID automatically to avoid collisions."}</span
                    >
                  </label>
                {/if}

                <label class="flex items-center space-x-3 cursor-pointer">
                  <input
                    class="form-checkbox w-5 h-5 rounded border-surface-500/30 bg-surface-50-900-token text-primary-500 focus:ring-primary-500"
                    type="checkbox"
                    bind:checked={sanitizeFilename}
                  />
                  <span class="text-sm"
                    >Auto-strip difficult filename characters</span
                  >
                </label>
              </div>
            </svelte:fragment>
          </AccordionItem>
        </Accordion>

        <!-- Authentication & Cookies Section -->
        <Accordion
          class="card variant-soft-surface border border-surface-500/10 overflow-hidden"
        >
          <AccordionItem>
            <svelte:fragment slot="lead"
              ><Shield size={20} /></svelte:fragment
            >
            <svelte:fragment slot="summary">
              <span class="font-bold">Authentication & Cookies</span>
            </svelte:fragment>
            <svelte:fragment slot="content">
              <div class="space-y-6 pt-2">
                <!-- Per-Site Cookie Management -->
                <div class="space-y-3">
                  <div class="flex items-center justify-between">
                    <span class="flex items-center space-x-2 text-sm font-semibold">
                      <FileJson size={16} />
                      <span>Site Cookies</span>
                    </span>
                    <button
                      class="btn btn-xs variant-soft-primary"
                      on:click={() => (showCookieModal = true)}
                    >
                      How to Get Cookies
                    </button>
                  </div>

                  <!-- Configured Sites List -->
                  {#if cookieSites.length > 0}
                    <div class="space-y-1">
                      {#each cookieSites as site}
                        <div
                          class="card p-2 variant-soft-surface border border-surface-500/10 flex items-center justify-between"
                        >
                          <div class="flex items-center space-x-2 min-w-0">
                            <CheckCircle2 size={14} class="text-success-500 flex-shrink-0" />
                            <span class="text-xs font-medium truncate">{site.domain}</span>
                            <span class="text-[10px] opacity-40 flex-shrink-0">
                              {new Date(site.lastModified).toLocaleDateString()}
                            </span>
                          </div>
                          <button
                            class="btn btn-xs variant-soft-error flex-shrink-0"
                            on:click={() => deleteSiteCookies(site.domain)}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      {/each}
                    </div>
                  {:else}
                    <div class="text-[10px] opacity-40">
                      No site cookies configured. Add cookies below for private or
                      age-restricted content.
                    </div>
                  {/if}

                  <!-- Add Cookies: Tabs -->
                  <div class="card variant-soft-surface border border-surface-500/10 overflow-hidden">
                    <!-- Tab Headers -->
                    <div class="flex border-b border-surface-500/10">
                      <button
                        class="flex-1 px-3 py-2 text-xs font-medium transition-colors"
                        class:variant-soft-primary={cookieTab === "upload"}
                        class:opacity-60={cookieTab !== "upload"}
                        on:click={() => (cookieTab = "upload")}
                      >
                        <Upload size={12} class="inline mr-1" />
                        Upload File
                      </button>
                      <button
                        class="flex-1 px-3 py-2 text-xs font-medium transition-colors"
                        class:variant-soft-primary={cookieTab === "paste"}
                        class:opacity-60={cookieTab !== "paste"}
                        on:click={() => (cookieTab = "paste")}
                      >
                        <Terminal size={12} class="inline mr-1" />
                        Paste from Browser
                      </button>
                    </div>

                    <!-- Tab Content -->
                    <div class="p-3 space-y-3">
                      {#if cookieTab === "upload"}
                        <span class="text-[10px] opacity-60 block">
                          Upload a cookies.txt file exported for a single site
                          from a browser extension.
                        </span>
                        <label class="label">
                          <span class="text-[10px] opacity-60"
                            >Domain (auto-detected if omitted)</span
                          >
                          <input
                            class="input input-sm"
                            type="text"
                            bind:value={cookiePasteDomain}
                            placeholder="youtube.com"
                          />
                        </label>
                        <div class="flex items-center gap-2">
                          <input
                            class="input input-sm flex-1"
                            type="file"
                            accept=".txt,.cookies"
                            on:change={(e) =>
                              (cookieUploadFile = e.currentTarget.files)}
                          />
                          <button
                            class="btn btn-sm variant-filled-primary"
                            on:click={uploadSiteCookies}
                            disabled={cookieUploading ||
                              !cookieUploadFile ||
                              cookieUploadFile.length === 0}
                          >
                            {#if cookieUploading}
                              <RefreshCw class="animate-spin mr-1" size={14} />
                            {:else}
                              <Upload size={14} class="mr-1" />
                            {/if}
                            Upload
                          </button>
                        </div>
                      {:else}
                        <span class="text-[10px] opacity-60 block">
                          Open DevTools (F12) → Network tab → click any request
                          to the site → copy the Cookie header value and paste
                          below.
                        </span>
                        <label class="label">
                          <span class="text-[10px] opacity-60">Domain</span>
                          <input
                            class="input input-sm"
                            type="text"
                            bind:value={cookiePasteDomain}
                            placeholder="youtube.com"
                          />
                        </label>
                        <label class="label">
                          <span class="text-[10px] opacity-60"
                            >Cookie Header Value</span
                          >
                          <textarea
                            class="textarea text-xs"
                            rows="3"
                            bind:value={cookiePasteString}
                            placeholder="SID=xxxx; HSID=xxxx; SSID=xxxx; APISID=xxxx"
                          ></textarea>
                        </label>
                        <button
                          class="btn btn-sm variant-filled-primary w-full"
                          on:click={pasteSiteCookies}
                          disabled={cookieUploading ||
                            !cookiePasteString.trim() ||
                            !cookiePasteDomain.trim()}
                        >
                          {#if cookieUploading}
                            <RefreshCw class="animate-spin mr-1" size={14} />
                          {:else}
                            <CheckCircle2 size={14} class="mr-1" />
                          {/if}
                          Save Cookies
                        </button>
                      {/if}
                    </div>
                  </div>
                </div>

                <div class="divider opacity-10"></div>

                <!-- Username/Password -->
                <div class="space-y-3">
                  <button
                    class="flex items-center space-x-2 text-sm font-semibold cursor-pointer hover:text-primary-400 transition-colors"
                    on:click={() => (showAuthSection = !showAuthSection)}
                  >
                    <Key size={16} />
                    <span>Site Credentials</span>
                    {#if showAuthSection}
                      <ChevronUp size={14} />
                    {:else}
                      <ChevronDown size={14} />
                    {/if}
                  </button>

                  {#if showAuthSection}
                    <div class="card p-3 variant-soft-surface border border-surface-500/10 space-y-3">
                      <div
                        class="card p-2 variant-soft-warning border border-warning-500/20 text-[10px] opacity-80"
                      >
                        Credentials are passed directly to yt-dlp and never
                        stored on disk or in download history. They are cleared
                        from the form after submitting.
                      </div>
                      <label class="label">
                        <span class="text-xs opacity-60">Username</span>
                        <input
                          class="input input-sm"
                          type="text"
                          bind:value={username}
                          placeholder="Optional"
                          autocomplete="off"
                        />
                      </label>
                      <label class="label">
                        <span class="text-xs opacity-60">Password</span>
                        <input
                          class="input input-sm"
                          type="password"
                          bind:value={password}
                          placeholder="Optional"
                          autocomplete="off"
                        />
                      </label>
                    </div>
                  {/if}
                </div>
              </div>
            </svelte:fragment>
          </AccordionItem>
        </Accordion>

        <button
          class="btn variant-filled-primary w-full py-4 font-bold shadow-lg border border-primary-500/50 hover:scale-[1.01] active:scale-[0.99] transition-all"
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
    <div class="card p-6 shadow-xl border border-surface-500/20">
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
            value={parseProgress(queue.active.progress)}
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
    <div class="card p-6 shadow-xl border border-surface-500/20">
      <header class="flex items-center space-x-3 mb-6">
        <div class="p-2 variant-soft-surface rounded-lg">
          <Clock size={20} />
        </div>
        <div class="flex items-center justify-between w-full gap-3">
          <h3 class="h3">Pending Queue ({queue.pending.length})</h3>
          <button
            class="btn btn-xs variant-soft-primary"
            on:click={openPendingModal}
          >
            Detailed View
          </button>
        </div>
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
    <div class="card p-6 shadow-xl border border-surface-500/20">
      <header class="flex justify-between items-center mb-6">
        <div class="flex items-center space-x-3">
          <div class="p-2 variant-soft-surface rounded-lg">
            <History size={20} />
          </div>
          <h3 class="h3">Recent Activity</h3>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="btn btn-xs variant-soft-primary"
            on:click={openBacklogModal}
          >
            Full Backlog
          </button>
          {#if queue.completed.length > 0}
            <button
              class="btn btn-sm variant-soft-error"
              on:click={clearHistory}
            >
              <Trash2 size={14} class="mr-1" />
              <span>Clear</span>
            </button>
          {/if}
        </div>
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

{#if showPendingModal}
  <button
    type="button"
    aria-label="Close pending queue details"
    class="fixed inset-0 bg-black/50 z-40"
    on:click={() => (showPendingModal = false)}
  ></button>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div
      class="card w-full max-w-4xl max-h-[85vh] overflow-hidden border border-surface-500/20 shadow-2xl"
    >
      <header
        class="p-4 border-b border-surface-500/20 flex items-center justify-between"
      >
        <h4 class="h4">
          Detailed Pending Queue ({detailedQueue.pending?.length || 0})
        </h4>
        <button
          class="btn btn-xs variant-soft-surface"
          on:click={() => (showPendingModal = false)}
        >
          Close
        </button>
      </header>
      <div class="p-4 overflow-auto max-h-[70vh] space-y-2">
        {#if detailedQueue.pending?.length > 0}
          {#each detailedQueue.pending as task, index}
            <div
              class="card p-3 variant-soft-surface border border-surface-500/10"
            >
              <div class="flex justify-between items-start gap-3">
                <div class="min-w-0">
                  <p class="text-xs opacity-60">#{index + 1}</p>
                  <p class="text-sm font-semibold break-all">{task.url}</p>
                  <p class="text-xs opacity-60 mt-1">
                    Audio: {task.options?.audioOnly ? "Yes" : "No"} | Location: {task
                      .options?.locationName || "Default"}
                  </p>
                </div>
                <button
                  class="btn btn-xs variant-soft-error"
                  on:click={() => removeTask(task.id)}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          {/each}
        {:else}
          <p class="text-sm opacity-60 italic">No pending items.</p>
        {/if}
      </div>
    </div>
  </div>
{/if}

{#if showBacklogModal}
  <button
    type="button"
    aria-label="Close full backlog details"
    class="fixed inset-0 bg-black/50 z-40"
    on:click={() => (showBacklogModal = false)}
  ></button>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div
      class="card w-full max-w-5xl max-h-[85vh] overflow-hidden border border-surface-500/20 shadow-2xl"
    >
      <header
        class="p-4 border-b border-surface-500/20 flex items-center justify-between"
      >
        <h4 class="h4">
          Full Backlog ({detailedQueue.completed?.length || 0})
        </h4>
        <button
          class="btn btn-xs variant-soft-surface"
          on:click={() => (showBacklogModal = false)}
        >
          Close
        </button>
      </header>
      <div class="p-4 overflow-auto max-h-[70vh] space-y-2">
        {#if detailedQueue.completed?.length > 0}
          {#each detailedQueue.completed as task}
            <div
              class="card p-3 variant-soft-surface border border-surface-500/10"
            >
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-sm font-semibold break-all">{task.url}</p>
                  <p class="text-xs opacity-60">
                    Status: {task.status} | Progress: {task.progress}
                  </p>
                  {#if task.error}
                    <p class="text-xs text-error-500 break-all">{task.error}</p>
                  {/if}
                </div>
                <button
                  class="btn btn-xs variant-soft-error"
                  on:click={() => removeTask(task.id)}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          {/each}
        {:else}
          <p class="text-sm opacity-60 italic">No backlog entries yet.</p>
        {/if}
      </div>
    </div>
  </div>
{/if}

{#if showCookieModal}
  <button
    type="button"
    aria-label="Close cookie instructions"
    class="fixed inset-0 bg-black/50 z-40"
    on:click={() => (showCookieModal = false)}
  ></button>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div
      class="card w-full max-w-2xl max-h-[85vh] overflow-hidden border border-surface-500/20 shadow-2xl"
    >
      <header
        class="p-4 border-b border-surface-500/20 flex items-center justify-between"
      >
        <h4 class="h4 flex items-center space-x-2">
          <FileJson size={20} />
          <span>How to Get Site Cookies</span>
        </h4>
        <button
          class="btn btn-xs variant-soft-surface"
          on:click={() => (showCookieModal = false)}
        >
          Close
        </button>
      </header>
      <div class="p-6 overflow-auto max-h-[70vh] space-y-5 text-sm">
        <div class="space-y-2">
          <h5 class="font-bold">Why use cookies?</h5>
          <p class="opacity-80">
            Some websites require authentication or have age restrictions. Cookies
            let yt-dlp access content as if it were logged in to your browser.
            You only need cookies for the specific sites you download from.
          </p>
        </div>

        <div class="divider opacity-10"></div>

        <div class="space-y-2">
          <h5 class="font-bold">Method 1: Paste from DevTools (No Extension Needed)</h5>
          <ol class="list-decimal list-inside space-y-2 opacity-80">
            <li>
              Open the website (e.g., YouTube) in your browser and log in.
            </li>
            <li>
              Open DevTools with <kbd class="kbd kbd-xs">F12</kbd> or
              <kbd class="kbd kbd-xs">Ctrl+Shift+I</kbd>.
            </li>
            <li>
              Go to the <strong>Network</strong> tab, then click any request to
              the site.
            </li>
            <li>
              In the request headers, find <code class="variant-soft-surface px-1 rounded">Cookie</code>
              and copy its entire value.
            </li>
            <li>
              In the WebUI, go to Authentication & Cookies → Paste from Browser,
              enter the domain, and paste the cookie value.
            </li>
          </ol>
          <div class="card p-2 variant-soft-surface border border-surface-500/10 text-xs opacity-70">
            <strong>Tip:</strong> For YouTube, any request to
            <code>youtube.com</code> or <code>googlevideo.com</code> works.
            The cookie value looks like
            <code>SID=xxx; HSID=xxx; SSID=xxx; ...</code>
          </div>
        </div>

        <div class="divider opacity-10"></div>

        <div class="space-y-2">
          <h5 class="font-bold">Method 2: Export from Browser Extension</h5>
          <ol class="list-decimal list-inside space-y-2 opacity-80">
            <li>
              Install a browser extension:
              <ul class="list-disc list-inside ml-4 mt-1 text-xs">
                <li>
                  <strong>Chrome/Edge:</strong> "Get cookies.txt LOCALLY"
                </li>
                <li>
                  <strong>Firefox:</strong> "cookies.txt"
                </li>
              </ul>
            </li>
            <li>
              Navigate to the target site (e.g., youtube.com).
            </li>
            <li>
              Click the extension icon and export cookies for
              <strong>just this site</strong> (not all sites).
            </li>
            <li>
              Upload the small resulting file via the WebUI.
            </li>
          </ol>
          <div class="card p-2 variant-soft-surface border border-surface-500/10 text-xs opacity-70">
            <strong>Important:</strong> Export cookies for a single site only.
            A full browser cookie export can be megabytes and slow to parse.
            A single-site export is typically under 5KB.
          </div>
        </div>

        <div class="divider opacity-10"></div>

        <div class="space-y-2">
          <h5 class="font-bold">Manual Placement (Home Assistant)</h5>
          <p class="opacity-80 text-xs">
            You can also place cookie files directly in
            <code class="variant-soft-surface px-1 rounded"
              >/share/yt-dlp-webui/cookies/</code
            >. Name them <code>domain.txt</code> (e.g.,
            <code>youtube.txt</code>). They'll be picked up automatically.
          </p>
        </div>

        <div class="card p-3 variant-soft-warning border border-warning-500/20">
          <p class="text-xs opacity-80">
            <strong>Security note:</strong> Cookies contain session tokens that
            grant access to your accounts. They are stored locally on this
            device only and never transmitted to third parties. Credentials
            (username/password fields) are never saved to disk.
          </p>
        </div>

        <div class="card p-3 variant-soft-secondary border border-secondary-500/20">
          <p class="text-xs opacity-80">
            <strong>YouTube tip:</strong> For age-restricted content, log in to
            YouTube in a <em>private/incognito window</em>, navigate to
            <code class="variant-soft-surface px-1 rounded">youtube.com/robots.txt</code>,
            then export cookies from that window. This avoids session rotation
            that can invalidate exported cookies.
          </p>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
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
