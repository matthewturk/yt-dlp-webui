<script lang="ts">
  import {
    getToastStore,
    ProgressBar,
    Accordion,
    AccordionItem,
  } from "@skeletonlabs/skeleton";
  import type { ToastSettings } from "@skeletonlabs/skeleton";
  import { onMount, onDestroy } from "svelte";
  import {
    Podcast,
    Plus,
    Trash2,
    Download,
    Upload,
    Play,
    Settings,
    FileText,
    Link,
    RefreshCw,
    ChevronDown,
    ChevronUp,
    CheckCircle2,
    XCircle,
    Clock,
    FolderSearch,
    Edit3,
    Save,
    X,
    List,
    Hash,
    Shield,
    Check,
  } from "lucide-svelte";

  const toastStore = getToastStore();

  interface Feed {
    id: string;
    name: string;
    csvPath: string;
    urlListPath: string;
    destinationDir: string;
    concurrency: number;
    downloadOptions: {
      audioOnly: boolean;
      audioFormat: string;
      embedMetadata: boolean;
      enhancedAudioMetadata: boolean;
      embedThumbnail: boolean;
      absMode: boolean;
      sanitizeFilename: boolean;
      noOverwrites: boolean;
      cookiesPath: string;
      extraArgs: string;
    };
    autoProcess: boolean;
    autoFile: boolean;
    createdAt: string;
    updatedAt: string;
  }

  let feeds: Feed[] = [];
  let selectedFeedId: string | null = null;
  let editingFeed: Partial<Feed> | null = null;
  let isNewFeed = false;

  let csvContent = "";
  let urlContent = "";
  let urlList: string[] = [];
  let urlDetailedList: Array<{ line: string; url: string; downloaded: boolean }> = [];
  let savingCsv = false;
  let savingUrls = false;
  let markingDownloaded = false;

  let scanFiles: Array<{
    name: string;
    path: string;
    type: string;
    size: number;
    lastModified: string;
  }> = [];
  let scanDirs: string[] = [];
  let newScanDir = "";
  let scanning = false;

  let processing = false;
  let processResults: any = null;

  let downloading = false;
  let downloadStatus: any = null;

  let pollInterval: any;

  onMount(() => {
    fetchFeeds();
    pollInterval = setInterval(fetchFeeds, 5000);
  });

  onDestroy(() => {
    if (pollInterval) clearInterval(pollInterval);
  });

  $: selectedFeed = feeds.find((f) => f.id === selectedFeedId);

  async function fetchFeeds() {
    try {
      const res = await fetch("/api/podcasts");
      const data = await res.json();
      feeds = data.feeds || [];
    } catch (e) {
      console.error("Failed to fetch feeds", e);
    }
  }

  async function createFeed() {
    isNewFeed = true;
    editingFeed = {
      name: "",
      csvPath: "",
      urlListPath: "",
      destinationDir: "",
      concurrency: 2,
      downloadOptions: {
        audioOnly: true,
        audioFormat: "m4a",
        embedMetadata: true,
        enhancedAudioMetadata: true,
        embedThumbnail: true,
        absMode: true,
        sanitizeFilename: true,
        noOverwrites: true,
        cookiesPath: "",
        extraArgs: "",
      },
      autoProcess: true,
      autoFile: true,
    };
    selectedFeedId = null;
    csvContent = "";
    urlContent = "";
    urlList = [];
  }

  async function editFeed(feed: Feed) {
    isNewFeed = false;
    editingFeed = JSON.parse(JSON.stringify(feed));
    selectedFeedId = feed.id;
    await loadFeedData(feed.id);
  }

  async function loadFeedData(feedId: string) {
    try {
      const [csvRes, urlRes] = await Promise.all([
        fetch(`/api/podcasts/${feedId}/csv`),
        fetch(`/api/podcasts/${feedId}/urls`),
      ]);
      const csvData = await csvRes.json();
      const urlData = await urlRes.json();
      csvContent = csvData.content || "";
      urlContent = urlData.content || "";
      urlList = urlData.urls || [];
      urlDetailedList = urlData.detailed || [];
    } catch (e) {
      console.error("Failed to load feed data", e);
    }
  }

  async function saveFeed() {
    if (!editingFeed) return;
    try {
      let res;
      if (isNewFeed) {
        res = await fetch("/api/podcasts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editingFeed),
        });
      } else {
        res = await fetch(`/api/podcasts/${editingFeed.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editingFeed),
        });
      }
      const data = await res.json();
      if (res.ok) {
        toastStore.trigger({
          message: isNewFeed ? "Feed created" : "Feed updated",
          background: "variant-filled-success",
        });
        editingFeed = null;
        isNewFeed = false;
        await fetchFeeds();
        if (data.feed) {
          selectedFeedId = data.feed.id;
          await loadFeedData(data.feed.id);
        }
      } else {
        toastStore.trigger({
          message: data.error || "Failed to save",
          background: "variant-filled-error",
        });
      }
    } catch (e) {
      toastStore.trigger({
        message: "Failed to connect to server",
        background: "variant-filled-error",
      });
    }
  }

  async function deleteFeed(id: string) {
    try {
      const res = await fetch(`/api/podcasts/${id}`, { method: "DELETE" });
      if (res.ok) {
        toastStore.trigger({
          message: "Feed deleted",
          background: "variant-filled-surface",
        });
        if (selectedFeedId === id) {
          selectedFeedId = null;
          editingFeed = null;
        }
        await fetchFeeds();
      }
    } catch (e) {
      console.error("Failed to delete feed", e);
    }
  }

  async function saveCsv() {
    if (!selectedFeedId) return;
    savingCsv = true;
    try {
      const res = await fetch(`/api/podcasts/${selectedFeedId}/csv`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: csvContent }),
      });
      if (res.ok) {
        toastStore.trigger({
          message: "CSV saved",
          background: "variant-filled-success",
        });
      }
    } catch (e) {
      toastStore.trigger({
        message: "Failed to save CSV",
        background: "variant-filled-error",
      });
    } finally {
      savingCsv = false;
    }
  }

  async function saveUrls() {
    if (!selectedFeedId) return;
    savingUrls = true;
    try {
      const res = await fetch(`/api/podcasts/${selectedFeedId}/urls`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: urlContent }),
      });
      if (res.ok) {
        toastStore.trigger({
          message: "URL list saved",
          background: "variant-filled-success",
        });
        // Refresh detailed list
        await loadFeedData(selectedFeedId);
      }
    } catch (e) {
      toastStore.trigger({
        message: "Failed to save URL list",
        background: "variant-filled-error",
      });
    } finally {
      savingUrls = false;
    }
  }

  async function startDownload() {
    if (!selectedFeedId) return;
    downloading = true;
    try {
      const res = await fetch(`/api/podcasts/${selectedFeedId}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        toastStore.trigger({
          message: data.message,
          background: "variant-filled-success",
        });
      } else {
        toastStore.trigger({
          message: data.error || "Failed to start download",
          background: "variant-filled-error",
        });
      }
    } catch (e) {
      toastStore.trigger({
        message: "Failed to connect to server",
        background: "variant-filled-error",
      });
    } finally {
      downloading = false;
    }
  }

  async function processFeed() {
    if (!selectedFeedId) return;
    processing = true;
    processResults = null;
    try {
      const res = await fetch(`/api/podcasts/${selectedFeedId}/process`, {
        method: "POST",
      });
      const data = await res.json();
      processResults = data;
      if (res.ok) {
        const msg = data.urlsMarked
          ? `Processed: ${data.summary.processed} ok, ${data.summary.skipped} skipped, ${data.urlsMarked} URLs marked`
          : `Processed: ${data.summary.processed} ok, ${data.summary.skipped} skipped, ${data.summary.errors} errors`;
        toastStore.trigger({
          message: msg,
          background: "variant-filled-success",
        });
        // Refresh URL list to show updated marks
        await loadFeedData(selectedFeedId);
      }
    } catch (e) {
      toastStore.trigger({
        message: "Failed to process",
        background: "variant-filled-error",
      });
    } finally {
      processing = false;
    }
  }

  async function markDownloaded() {
    if (!selectedFeedId) return;
    markingDownloaded = true;
    try {
      const res = await fetch(`/api/podcasts/${selectedFeedId}/mark-downloaded`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        toastStore.trigger({
          message: data.message,
          background: "variant-filled-success",
        });
        // Refresh URL list to show updated marks
        await loadFeedData(selectedFeedId);
      } else {
        toastStore.trigger({
          message: data.error || "Failed to mark",
          background: "variant-filled-error",
        });
      }
    } catch (e) {
      toastStore.trigger({
        message: "Failed to connect to server",
        background: "variant-filled-error",
      });
    } finally {
      markingDownloaded = false;
    }
  }

  async function scanDirectories() {
    scanning = true;
    try {
      const res = await fetch("/api/podcasts/scan");
      const data = await res.json();
      scanFiles = data.files || [];
      scanDirs = data.scanDirs || [];
    } catch (e) {
      console.error("Failed to scan", e);
    } finally {
      scanning = false;
    }
  }

  async function addScanDir() {
    if (!newScanDir.trim()) return;
    try {
      const res = await fetch("/api/podcasts/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", dir: newScanDir.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        scanDirs = data.scanDirs || [];
        newScanDir = "";
        await scanDirectories();
      }
    } catch (e) {
      console.error("Failed to add scan dir", e);
    }
  }

  async function removeScanDir(dir: string) {
    try {
      const res = await fetch("/api/podcasts/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", dir }),
      });
      const data = await res.json();
      if (res.ok) {
        scanDirs = data.scanDirs || [];
        await scanDirectories();
      }
    } catch (e) {
      console.error("Failed to remove scan dir", e);
    }
  }

  function useDiscoveredFile(filePath: string, type: string) {
    if (!editingFeed) return;
    if (type === "csv") {
      editingFeed.csvPath = filePath;
    } else {
      editingFeed.urlListPath = filePath;
    }
    toastStore.trigger({
      message: `Set ${type === "csv" ? "CSV" : "URL list"} path`,
      background: "variant-filled-success",
    });
  }

  let showScanModal = false;
</script>

<div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
  <!-- Left: Feed List & Actions -->
  <div class="lg:col-span-4 space-y-6">
    <div class="card p-6 shadow-xl border border-surface-500/20">
      <header class="flex items-center justify-between mb-6">
        <div class="flex items-center space-x-3">
          <div class="p-2 variant-soft-primary rounded-lg">
            <Podcast size={24} />
          </div>
          <div>
            <h2 class="h2">Podcast Feeds</h2>
            <p class="text-sm opacity-60">{feeds.length} feed(s)</p>
          </div>
        </div>
        <button
          class="btn btn-sm variant-filled-primary"
          on:click={createFeed}
        >
          <Plus size={16} />
        </button>
      </header>

      {#if feeds.length === 0}
        <div class="p-6 text-center opacity-40 border-2 border-dashed border-surface-500/20 rounded-xl">
          <p class="text-sm italic">No feeds configured</p>
          <button class="btn btn-sm variant-soft-primary mt-3" on:click={createFeed}>
            Create your first feed
          </button>
        </div>
      {:else}
        <div class="space-y-2">
          {#each feeds as feed}
            <div
              class="card p-3 variant-soft-surface border border-surface-500/10 cursor-pointer hover:variant-soft-primary transition-colors"
              class:variant-soft-primary={selectedFeedId === feed.id}
              on:click={() => {
                selectedFeedId = feed.id;
                editingFeed = null;
                loadFeedData(feed.id);
              }}
              on:keydown={() => {}}
              role="button"
              tabindex="0"
            >
              <div class="flex items-center justify-between">
                <div class="min-w-0">
                  <p class="text-sm font-bold truncate">{feed.name}</p>
                  <p class="text-[10px] opacity-50 truncate">
                    {feed.destinationDir || "No destination"}
                  </p>
                </div>
                <div class="flex items-center gap-1 flex-shrink-0">
                  <button
                    class="btn btn-xs variant-soft-surface"
                    title="Edit"
                    on:click|stopPropagation={() => editFeed(feed)}
                  >
                    <Edit3 size={12} />
                  </button>
                  <button
                    class="btn btn-xs variant-soft-error"
                    title="Delete"
                    on:click|stopPropagation={() => deleteFeed(feed.id)}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Scan Directories -->
    <div class="card p-6 shadow-xl border border-surface-500/20">
      <header class="flex items-center justify-between mb-4">
        <div class="flex items-center space-x-2">
          <FolderSearch size={18} />
          <span class="text-sm font-bold">Scan Directories</span>
        </div>
        <button
          class="btn btn-xs variant-soft-primary"
          on:click={() => {
            showScanModal = true;
            scanDirectories();
          }}
        >
          Scan
        </button>
      </header>

      {#if scanDirs.length > 0}
        <div class="space-y-1">
          {#each scanDirs as dir}
            <div class="flex items-center justify-between text-xs">
              <span class="truncate opacity-60">{dir}</span>
              <button
                class="btn btn-xs variant-soft-error flex-shrink-0"
                on:click={() => removeScanDir(dir)}
              >
                <X size={10} />
              </button>
            </div>
          {/each}
        </div>
      {:else}
        <p class="text-[10px] opacity-40">No directories configured</p>
      {/if}
    </div>
  </div>

  <!-- Right: Feed Detail / Editor -->
  <div class="lg:col-span-8 space-y-6">
    {#if editingFeed}
      <!-- Feed Editor -->
      <div class="card p-6 shadow-xl border border-surface-500/20">
        <header class="flex items-center justify-between mb-6">
          <h3 class="h3">{isNewFeed ? "Create Feed" : "Edit Feed"}</h3>
          <div class="flex gap-2">
            <button class="btn btn-sm variant-soft-surface" on:click={() => { editingFeed = null; isNewFeed = false; }}>
              <X size={14} /> Cancel
            </button>
            <button class="btn btn-sm variant-filled-primary" on:click={saveFeed}>
              <Save size={14} /> Save
            </button>
          </div>
        </header>

        <div class="space-y-6">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label class="label">
              <span class="text-xs opacity-60">Feed Name</span>
              <input class="input" type="text" bind:value={editingFeed.name} placeholder="e.g. Dimension 20" />
            </label>
            <label class="label">
              <span class="text-xs opacity-60">Destination Directory</span>
              <input class="input" type="text" bind:value={editingFeed.destinationDir} placeholder="/media/podcasts/Dimension 20" />
            </label>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label class="label">
              <span class="text-xs opacity-60 flex items-center gap-1"><FileText size={12} /> CSV Path</span>
              <input class="input" type="text" bind:value={editingFeed.csvPath} placeholder="/path/to/episodes.csv" />
            </label>
            <label class="label">
              <span class="text-xs opacity-60 flex items-center gap-1"><Link size={12} /> URL List Path</span>
              <input class="input" type="text" bind:value={editingFeed.urlListPath} placeholder="/path/to/urls.txt" />
            </label>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label class="label">
              <span class="text-xs opacity-60 flex items-center gap-1"><Hash size={12} /> Concurrency</span>
              <input class="input" type="number" min="1" max="10" bind:value={editingFeed.concurrency} />
            </label>
            <label class="label">
              <span class="text-xs opacity-60">Audio Format</span>
              <select class="select" bind:value={editingFeed.downloadOptions.audioFormat}>
                <option value="m4a">M4A</option>
                <option value="mp3">MP3</option>
                <option value="opus">Opus</option>
                <option value="wav">WAV</option>
              </select>
            </label>
            <label class="label">
              <span class="text-xs opacity-60">Cookie Jar Path</span>
              <input class="input" type="text" bind:value={editingFeed.downloadOptions.cookiesPath} placeholder="/path/to/cookies.txt" />
            </label>
          </div>

          <div class="divider opacity-10"></div>

          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label class="flex items-center space-x-2 text-xs cursor-pointer">
              <input type="checkbox" class="form-checkbox w-4 h-4" bind:checked={editingFeed.downloadOptions.audioOnly} />
              <span>Audio Only</span>
            </label>
            <label class="flex items-center space-x-2 text-xs cursor-pointer">
              <input type="checkbox" class="form-checkbox w-4 h-4" bind:checked={editingFeed.downloadOptions.embedMetadata} />
              <span>Embed Metadata</span>
            </label>
            <label class="flex items-center space-x-2 text-xs cursor-pointer">
              <input type="checkbox" class="form-checkbox w-4 h-4" bind:checked={editingFeed.downloadOptions.enhancedAudioMetadata} />
              <span>Enhanced Tags</span>
            </label>
            <label class="flex items-center space-x-2 text-xs cursor-pointer">
              <input type="checkbox" class="form-checkbox w-4 h-4" bind:checked={editingFeed.downloadOptions.embedThumbnail} />
              <span>Embed Thumbnail</span>
            </label>
            <label class="flex items-center space-x-2 text-xs cursor-pointer">
              <input type="checkbox" class="form-checkbox w-4 h-4" bind:checked={editingFeed.downloadOptions.absMode} />
              <span>ABS Mode</span>
            </label>
            <label class="flex items-center space-x-2 text-xs cursor-pointer">
              <input type="checkbox" class="form-checkbox w-4 h-4" bind:checked={editingFeed.downloadOptions.sanitizeFilename} />
              <span>Sanitize Filenames</span>
            </label>
            <label class="flex items-center space-x-2 text-xs cursor-pointer">
              <input type="checkbox" class="form-checkbox w-4 h-4" bind:checked={editingFeed.autoProcess} />
              <span>Auto-Process</span>
            </label>
            <label class="flex items-center space-x-2 text-xs cursor-pointer">
              <input type="checkbox" class="form-checkbox w-4 h-4" bind:checked={editingFeed.downloadOptions.autoFile} />
              <span>Auto-File</span>
            </label>
            <label class="flex items-center space-x-2 text-xs cursor-pointer">
              <input type="checkbox" class="form-checkbox w-4 h-4" bind:checked={editingFeed.downloadOptions.noOverwrites} />
              <span class="flex items-center gap-1"><Shield size={10} /> No Overwrites</span>
            </label>
          </div>
        </div>
      </div>
    {:else if selectedFeed}
      <!-- Feed Detail View -->
      <div class="card p-6 shadow-xl border border-surface-500/20">
        <header class="flex items-center justify-between mb-6">
          <div class="flex items-center space-x-3">
            <div class="p-2 variant-soft-primary rounded-lg">
              <Podcast size={24} />
            </div>
            <div>
              <h2 class="h2">{selectedFeed.name}</h2>
              <p class="text-sm opacity-60">{selectedFeed.destinationDir || "No destination"}</p>
            </div>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-sm variant-soft-primary" on:click={() => editFeed(selectedFeed)}>
              <Edit3 size={14} /> Edit
            </button>
            <button
              class="btn btn-sm variant-filled-success"
              on:click={startDownload}
              disabled={downloading || urlList.length === 0}
            >
              {#if downloading}
                <RefreshCw size={14} class="animate-spin" />
              {:else}
                <Download size={14} />
              {/if}
              Download ({urlList.length} URLs)
            </button>
            <button
              class="btn btn-sm variant-filled-warning"
              on:click={processFeed}
              disabled={processing}
            >
              {#if processing}
                <RefreshCw size={14} class="animate-spin" />
              {:else}
                <Play size={14} />
              {/if}
              Process
            </button>
          </div>
        </header>

        <!-- Feed Info -->
        <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <div class="card p-3 variant-soft-surface text-center">
            <p class="text-lg font-bold">{selectedFeed.concurrency}</p>
            <p class="text-[10px] opacity-50">Concurrency</p>
          </div>
          <div class="card p-3 variant-soft-surface text-center">
            <p class="text-lg font-bold">{urlList.length}</p>
            <p class="text-[10px] opacity-50">Pending</p>
          </div>
          <div class="card p-3 variant-soft-surface text-center">
            <p class="text-lg font-bold">{selectedFeed.downloadOptions.audioFormat.toUpperCase()}</p>
            <p class="text-[10px] opacity-50">Format</p>
          </div>
          <div class="card p-3 variant-soft-surface text-center">
            <p class="text-lg font-bold">{selectedFeed.downloadOptions.absMode ? "Yes" : "No"}</p>
            <p class="text-[10px] opacity-50">ABS Mode</p>
          </div>
          <div class="card p-3 text-center"
            class:variant-soft-success={selectedFeed.downloadOptions.noOverwrites}
            class:variant-soft-surface={!selectedFeed.downloadOptions.noOverwrites}
          >
            <p class="text-lg font-bold">{selectedFeed.downloadOptions.noOverwrites ? "On" : "Off"}</p>
            <p class="text-[10px] opacity-50">No Overwrites</p>
          </div>
        </div>

        <!-- CSV Editor -->
        <Accordion class="card variant-soft-surface border border-surface-500/10 overflow-hidden">
          <AccordionItem>
            <svelte:fragment slot="lead"><FileText size={18} /></svelte:fragment>
            <svelte:fragment slot="summary">
              <span class="font-bold">CSV Metadata ({csvContent.split("\n").length - 1} rows)</span>
            </svelte:fragment>
            <svelte:fragment slot="content">
              <div class="space-y-3">
                <p class="text-[10px] opacity-60">
                  Path: {selectedFeed.csvPath || "Not set"}
                </p>
                <textarea
                  class="textarea font-mono text-xs"
                  rows="12"
                  bind:value={csvContent}
                  placeholder="No. overall,No. in season,Title,Original release date,Season&#10;0,1,&quot;Episode Title&quot;,&quot;January 1, 2024&quot;,1"
                ></textarea>
                <button
                  class="btn btn-sm variant-filled-primary"
                  on:click={saveCsv}
                  disabled={savingCsv}
                >
                  {#if savingCsv}
                    <RefreshCw size={14} class="animate-spin mr-1" />
                  {:else}
                    <Save size={14} class="mr-1" />
                  {/if}
                  Save CSV
                </button>
              </div>
            </svelte:fragment>
          </AccordionItem>
        </Accordion>

        <!-- URL List Editor -->
        <Accordion class="card variant-soft-surface border border-surface-500/10 overflow-hidden mt-3">
          <AccordionItem>
            <svelte:fragment slot="lead"><Link size={18} /></svelte:fragment>
            <svelte:fragment slot="summary">
              <span class="font-bold">
                URL List ({urlList.length} pending
                {#if urlDetailedList.length > urlList.length}
                  / {urlDetailedList.length - urlList.length} downloaded
                {/if})
              </span>
            </svelte:fragment>
            <svelte:fragment slot="content">
              <div class="space-y-3">
                <p class="text-[10px] opacity-60">
                  Path: {selectedFeed.urlListPath || "Not set"}
                </p>

                <!-- Visual URL status list -->
                {#if urlDetailedList.length > 0}
                  <div class="space-y-1 max-h-[200px] overflow-y-auto">
                    {#each urlDetailedList as item}
                      <div class="flex items-center gap-2 text-xs py-1 px-2 rounded"
                        class:opacity-40={item.downloaded}
                        class:line-through={item.downloaded}
                      >
                        {#if item.downloaded}
                          <Check size={12} class="text-success-500 flex-shrink-0" />
                        {:else if item.url}
                          <Clock size={12} class="text-surface-400 flex-shrink-0" />
                        {:else}
                          <span class="w-3"></span>
                        {/if}
                        <span class="truncate font-mono text-[10px]">
                          {item.url || item.line}
                        </span>
                      </div>
                    {/each}
                  </div>
                  <div class="divider opacity-10"></div>
                {/if}

                <!-- Raw text editor -->
                <p class="text-[10px] opacity-60">Raw editor (one URL per line, # prefix = downloaded):</p>
                <textarea
                  class="textarea font-mono text-xs"
                  rows="10"
                  bind:value={urlContent}
                  placeholder="https://example.com/episode1&#10;https://example.com/episode2"
                ></textarea>

                <div class="flex gap-2">
                  <button
                    class="btn btn-sm variant-filled-primary"
                    on:click={saveUrls}
                    disabled={savingUrls}
                  >
                    {#if savingUrls}
                      <RefreshCw size={14} class="animate-spin mr-1" />
                    {:else}
                      <Save size={14} class="mr-1" />
                    {/if}
                    Save URLs
                  </button>
                  <button
                    class="btn btn-sm variant-soft-success"
                    on:click={markDownloaded}
                    disabled={markingDownloaded || !selectedFeed?.destinationDir}
                    title="Scan destination directory and mark completed URLs"
                  >
                    {#if markingDownloaded}
                      <RefreshCw size={14} class="animate-spin mr-1" />
                    {:else}
                      <CheckCircle2 size={14} class="mr-1" />
                    {/if}
                    Mark Downloaded
                  </button>
                </div>
              </div>
            </svelte:fragment>
          </AccordionItem>
        </Accordion>

        <!-- Process Results -->
        {#if processResults}
          <div class="card p-4 variant-soft-surface border border-surface-500/10 mt-3">
            <h4 class="font-bold text-sm mb-2">Processing Results</h4>
            <div class="grid grid-cols-4 gap-2 mb-3">
              <div class="text-center">
                <p class="text-lg font-bold text-success-500">{processResults.summary.processed}</p>
                <p class="text-[10px] opacity-50">Processed</p>
              </div>
              <div class="text-center">
                <p class="text-lg font-bold text-warning-500">{processResults.summary.skipped}</p>
                <p class="text-[10px] opacity-50">Skipped</p>
              </div>
              <div class="text-center">
                <p class="text-lg font-bold text-error-500">{processResults.summary.errors}</p>
                <p class="text-[10px] opacity-50">Errors</p>
              </div>
              <div class="text-center">
                <p class="text-lg font-bold text-primary-500">{processResults.urlsMarked || 0}</p>
                <p class="text-[10px] opacity-50">URLs Marked</p>
              </div>
            </div>
            {#if processResults.results.length > 0}
              <div class="space-y-1 max-h-[200px] overflow-y-auto">
                {#each processResults.results as result}
                  <div class="text-xs flex items-center gap-2">
                    {#if result.status === "processed"}
                      <CheckCircle2 size={12} class="text-success-500 flex-shrink-0" />
                    {:else if result.status === "error"}
                      <XCircle size={12} class="text-error-500 flex-shrink-0" />
                    {:else}
                      <Clock size={12} class="text-warning-500 flex-shrink-0" />
                    {/if}
                    <span class="truncate">{result.message}</span>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {:else}
      <!-- No feed selected -->
      <div class="card p-12 shadow-xl border border-surface-500/20 text-center">
        <Podcast size={48} class="mx-auto opacity-20 mb-4" />
        <h3 class="h3 opacity-40">Select a feed or create a new one</h3>
        <p class="text-sm opacity-30 mt-2">
          Podcast feeds let you manage batch downloads with CSV metadata and auto-processing
        </p>
      </div>
    {/if}
  </div>
</div>

<!-- Scan Modal -->
{#if showScanModal}
  <button
    type="button"
    aria-label="Close scan modal"
    class="fixed inset-0 bg-black/50 z-40"
    on:click={() => (showScanModal = false)}
  ></button>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div class="card w-full max-w-3xl max-h-[85vh] overflow-hidden border border-surface-500/20 shadow-2xl">
      <header class="p-4 border-b border-surface-500/20 flex items-center justify-between">
        <h4 class="h4">Scan Directories</h4>
        <button class="btn btn-xs variant-soft-surface" on:click={() => (showScanModal = false)}>
          Close
        </button>
      </header>
      <div class="p-4 space-y-4 overflow-auto max-h-[70vh]">
        <!-- Add scan dir -->
        <div class="flex gap-2">
          <input
            class="input flex-1"
            type="text"
            bind:value={newScanDir}
            placeholder="/path/to/podcast/directories"
          />
          <button class="btn btn-sm variant-filled-primary" on:click={addScanDir}>
            <Plus size={14} /> Add
          </button>
        </div>

        <!-- Current scan dirs -->
        {#if scanDirs.length > 0}
          <div class="space-y-1">
            {#each scanDirs as dir}
              <div class="flex items-center justify-between p-2 variant-soft-surface rounded text-xs">
                <span class="truncate">{dir}</span>
                <button class="btn btn-xs variant-soft-error" on:click={() => removeScanDir(dir)}>
                  <Trash2 size={10} />
                </button>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Discovered files -->
        {#if scanFiles.length > 0}
          <div class="divider opacity-10"></div>
          <h5 class="font-bold text-sm">Discovered Files ({scanFiles.length})</h5>
          <div class="space-y-1 max-h-[300px] overflow-y-auto">
            {#each scanFiles as file}
              <div class="card p-2 variant-soft-surface border border-surface-500/10 flex items-center justify-between">
                <div class="min-w-0">
                  <p class="text-xs font-medium truncate">{file.name}</p>
                  <p class="text-[10px] opacity-40 truncate">{file.path}</p>
                </div>
                <div class="flex gap-1 flex-shrink-0">
                  {#if editingFeed}
                    <button
                      class="btn btn-xs variant-soft-primary"
                      on:click={() => useDiscoveredFile(file.path, file.type)}
                    >
                      Use
                    </button>
                  {/if}
                  <span class="badge variant-soft-surface text-[10px]">{file.type}</span>
                </div>
              </div>
            {/each}
          </div>
        {:else if scanDirs.length > 0}
          <button
            class="btn btn-sm variant-soft-primary w-full"
            on:click={scanDirectories}
            disabled={scanning}
          >
            {#if scanning}
              <RefreshCw size={14} class="animate-spin mr-1" />
            {:else}
              <FolderSearch size={14} class="mr-1" />
            {/if}
            Scan Now
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}
