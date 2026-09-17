(() => {
  "use strict";

  const TRACK_COUNT = 58;
  const STORAGE_KEY = "xenRebirthBgmPlayerV1";

  /* Supabase */
  const SUPABASE_URL = "https://dzxxjtmpcfsmvdgkcwvn.supabase.co";
  const SUPABASE_KEY = "sb_publishable_yTgQ5bw5pnSkNCTOH4me8Q_YaQhRkQ_";

  const tracks = Array.from({ length: TRACK_COUNT }, (_, i) => {
    const number = String(i + 1).padStart(2, "0");

    return {
      number,
      title: `BGM ${number}`,
      src: `assets/bgm/${number}.ogg`
    };
  });

  const defaultState = {
    track: 0,
    volume: 0.45,
    shuffle: false,
    repeat: false,
    expanded: false
  };

  let savedState = {};

  try {
    savedState = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "{}"
    );
  } catch (error) {
    savedState = {};
  }

  const state = {
    ...defaultState,
    ...savedState
  };

  state.track = Math.max(
    0,
    Math.min(TRACK_COUNT - 1, Number(state.track) || 0)
  );

  state.volume = Math.max(
    0,
    Math.min(
      1,
      Number(state.volume) || defaultState.volume
    )
  );

  function saveState() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        track: state.track,
        volume: state.volume,
        shuffle: state.shuffle,
        repeat: state.repeat,
        expanded: state.expanded
      })
    );
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) {
      return "0:00";
    }

    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);

    return `${minutes}:${String(secs).padStart(2, "0")}`;
  }

  /* ========================================
     SupabaseからBGM名を取得
  ======================================== */

  async function fetchBgmTitles() {
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/bgm_tracks?select=track_number,title&order=track_number.asc`,
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(
          `BGM title fetch failed: ${response.status}`
        );
      }

      const data = await response.json();

      data.forEach(row => {
        const index = Number(row.track_number) - 1;

        if (
          index >= 0 &&
          index < TRACK_COUNT &&
          typeof row.title === "string" &&
          row.title.trim()
        ) {
          tracks[index].title = row.title.trim();
        }
      });

      return true;

    } catch (error) {
      console.error(error);
      return false;
    }
  }

  /* ========================================
     SupabaseへBGM名を保存
  ======================================== */

  async function saveBgmTitle(trackNumber, newTitle) {
    const title = newTitle.trim();

    if (!title) {
      throw new Error("曲名を入力してください。");
    }

    if (title.length > 100) {
      throw new Error("曲名は100文字以内で入力してください。");
    }

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/bgm_tracks?track_number=eq.${trackNumber}`,
      {
        method: "PATCH",

        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },

        body: JSON.stringify({
          title,
          updated_at: new Date().toISOString()
        })
      }
    );

    if (!response.ok) {
      const message = await response.text();

      console.error(message);

      throw new Error(
        "曲名を保存できませんでした。"
      );
    }

    const data = await response.json();

    if (!data.length) {
      throw new Error(
        "曲名を保存できませんでした。"
      );
    }

    return data[0];
  }

  /* ========================================
     プレイヤー作成
  ======================================== */

  async function createPlayer() {

    if (
      document.querySelector(".xen-bgm-player")
    ) {
      return;
    }

    /* 最初に曲名を取得 */
    await fetchBgmTitles();

    const player = document.createElement("section");

    player.className = "xen-bgm-player";

    player.setAttribute(
      "aria-label",
      "Xen Rebirth BGMプレイヤー"
    );

    player.innerHTML = `
      <button
        class="xen-bgm-mini"
        type="button"
        aria-label="BGMプレイヤーを開く"
        aria-expanded="false"
      >
        <span class="xen-bgm-mini-icon">♪</span>

        <span class="xen-bgm-mini-text">
          <strong>BGM</strong>
          <small>OFF</small>
        </span>
      </button>

      <div
        class="xen-bgm-panel"
        aria-hidden="true"
      >

        <div class="xen-bgm-header">

          <div>
            <span class="xen-bgm-eyebrow">
              XEN REBIRTH
            </span>

            <strong>
              BGM PLAYER
            </strong>
          </div>

          <button
            class="xen-bgm-close"
            type="button"
            aria-label="BGMプレイヤーを閉じる"
          >
            ×
          </button>

        </div>

        <div class="xen-bgm-now">

          <div
            class="xen-bgm-disc"
            aria-hidden="true"
          >
            <span>♪</span>
          </div>

          <div class="xen-bgm-now-text">

            <small>
              NOW PLAYING
            </small>

            <strong class="xen-bgm-title">
              BGM 01
            </strong>

            <span class="xen-bgm-counter">
              TRACK 01 / 58
            </span>

          </div>

        </div>

        <div class="xen-bgm-progress-wrap">

          <span class="xen-bgm-current-time">
            0:00
          </span>

          <input
            class="xen-bgm-progress"
            type="range"
            min="0"
            max="100"
            value="0"
            step="0.1"
            aria-label="再生位置"
          >

          <span class="xen-bgm-duration">
            0:00
          </span>

        </div>

        <div class="xen-bgm-main-controls">

          <button
            class="xen-bgm-shuffle"
            type="button"
            aria-label="シャッフル"
            title="シャッフル"
          >
            ⇄
          </button>

          <button
            class="xen-bgm-prev"
            type="button"
            aria-label="前の曲"
            title="前の曲"
          >
            ◀◀
          </button>

          <button
            class="xen-bgm-play"
            type="button"
            aria-label="再生"
            title="再生"
          >
            ▶
          </button>

          <button
            class="xen-bgm-next"
            type="button"
            aria-label="次の曲"
            title="次の曲"
          >
            ▶▶
          </button>

          <button
            class="xen-bgm-repeat"
            type="button"
            aria-label="リピート"
            title="リピート"
          >
            ↻
          </button>

        </div>

        <div class="xen-bgm-volume-row">

          <span aria-hidden="true">
            🔊
          </span>

          <input
            class="xen-bgm-volume"
            type="range"
            min="0"
            max="1"
            value="0.45"
            step="0.01"
            aria-label="音量"
          >

          <span class="xen-bgm-volume-value">
            45%
          </span>

        </div>

        <button
          class="xen-bgm-list-toggle"
          type="button"
        >
          <span>
            ♫ 曲を選ぶ
          </span>

          <span class="xen-bgm-list-arrow">
            ⌄
          </span>
        </button>

        <div
          class="xen-bgm-track-list"
          hidden
        ></div>

      </div>

      <audio
        class="xen-bgm-audio"
        preload="metadata"
      ></audio>
    `;

    document.body.appendChild(player);

    const audio =
      player.querySelector(".xen-bgm-audio");

    const miniButton =
      player.querySelector(".xen-bgm-mini");

    const miniStatus =
      player.querySelector(".xen-bgm-mini small");

    const panel =
      player.querySelector(".xen-bgm-panel");

    const closeButton =
      player.querySelector(".xen-bgm-close");

    const title =
      player.querySelector(".xen-bgm-title");

    const counter =
      player.querySelector(".xen-bgm-counter");

    const playButton =
      player.querySelector(".xen-bgm-play");

    const prevButton =
      player.querySelector(".xen-bgm-prev");

    const nextButton =
      player.querySelector(".xen-bgm-next");

    const shuffleButton =
      player.querySelector(".xen-bgm-shuffle");

    const repeatButton =
      player.querySelector(".xen-bgm-repeat");

    const progress =
      player.querySelector(".xen-bgm-progress");

    const currentTime =
      player.querySelector(".xen-bgm-current-time");

    const duration =
      player.querySelector(".xen-bgm-duration");

    const volume =
      player.querySelector(".xen-bgm-volume");

    const volumeValue =
      player.querySelector(".xen-bgm-volume-value");

    const listToggle =
      player.querySelector(".xen-bgm-list-toggle");

    const listArrow =
      player.querySelector(".xen-bgm-list-arrow");

    const trackList =
      player.querySelector(".xen-bgm-track-list");

    /* ========================================
       曲一覧
    ======================================== */

    function buildTrackList() {

      trackList.innerHTML = "";

      const fragment =
        document.createDocumentFragment();

      tracks.forEach((track, index) => {

        const row =
          document.createElement("div");

        row.className =
          "xen-bgm-track-row";

        const button =
          document.createElement("button");

        button.type = "button";

        button.className =
          "xen-bgm-track";

        button.dataset.index = index;

        button.innerHTML = `
          <span class="xen-bgm-track-number">
            ${track.number}
          </span>

          <span class="xen-bgm-track-name"></span>

          <span class="xen-bgm-track-playing">
            ♪
          </span>
        `;

        button.querySelector(
          ".xen-bgm-track-name"
        ).textContent = track.title;

        button.addEventListener(
          "click",
          () => {
            loadTrack(index, true);
          }
        );

        const editButton =
          document.createElement("button");

        editButton.type = "button";

        editButton.className =
          "xen-bgm-track-edit";

        editButton.title =
          "曲名を編集";

        editButton.setAttribute(
          "aria-label",
          `${track.number}番の曲名を編集`
        );

        editButton.textContent = "✏️";

        editButton.addEventListener(
          "click",
          async event => {

            event.stopPropagation();

            const newTitle =
              window.prompt(
                `BGM ${track.number} の曲名を入力してください`,
                track.title
              );

            if (newTitle === null) {
              return;
            }

            const cleanTitle =
              newTitle.trim();

            if (!cleanTitle) {
              alert(
                "曲名を入力してください。"
              );
              return;
            }

            if (cleanTitle.length > 100) {
              alert(
                "曲名は100文字以内で入力してください。"
              );
              return;
            }

            editButton.disabled = true;
            editButton.textContent = "…";

            try {

              await saveBgmTitle(
                index + 1,
                cleanTitle
              );

              tracks[index].title =
                cleanTitle;

              buildTrackList();

              if (state.track === index) {

                title.textContent =
                  cleanTitle;

                if (!audio.paused) {
                  miniStatus.textContent =
                    cleanTitle;
                }

              }

              alert(
                "曲名を更新しました。"
              );

            } catch (error) {

              console.error(error);

              alert(
                error.message ||
                "曲名を保存できませんでした。"
              );

              editButton.disabled = false;
              editButton.textContent = "✏️";
            }
          }
        );

        row.appendChild(button);
        row.appendChild(editButton);

        fragment.appendChild(row);
      });

      trackList.appendChild(fragment);

      updateTrackList();
    }

    function updateTrackList() {

      player
        .querySelectorAll(".xen-bgm-track")
        .forEach((button, index) => {

          button.classList.toggle(
            "is-current",
            index === state.track
          );

        });
    }

    /* ========================================
       ボタン状態
    ======================================== */

    function updateModeButtons() {

      shuffleButton.classList.toggle(
        "is-active",
        state.shuffle
      );

      repeatButton.classList.toggle(
        "is-active",
        state.repeat
      );

      shuffleButton.setAttribute(
        "aria-pressed",
        String(state.shuffle)
      );

      repeatButton.setAttribute(
        "aria-pressed",
        String(state.repeat)
      );
    }

    function updateVolume() {

      audio.volume =
        state.volume;

      volume.value =
        state.volume;

      volumeValue.textContent =
        `${Math.round(state.volume * 100)}%`;
    }

    function updatePlayState() {

      const playing =
        !audio.paused;

      playButton.textContent =
        playing ? "❚❚" : "▶";

      playButton.setAttribute(
        "aria-label",
        playing ? "一時停止" : "再生"
      );

      miniStatus.textContent =
        playing
          ? tracks[state.track].title
          : "OFF";

      player.classList.toggle(
        "is-playing",
        playing
      );
    }

    /* ========================================
       曲読み込み
    ======================================== */

    function loadTrack(
      index,
      autoplay = false
    ) {

      state.track = index;

      const track =
        tracks[state.track];

      audio.src =
        track.src;

      title.textContent =
        track.title;

      counter.textContent =
        `TRACK ${track.number} / ${String(
          TRACK_COUNT
        ).padStart(2, "0")}`;

      progress.value = 0;

      currentTime.textContent =
        "0:00";

      duration.textContent =
        "0:00";

      updateTrackList();

      saveState();

      if (autoplay) {

        audio.play().catch(() => {
          updatePlayState();
        });
      }
    }

    function nextTrack(
      autoplay = true
    ) {

      let nextIndex;

      if (state.shuffle) {

        if (TRACK_COUNT <= 1) {

          nextIndex = 0;

        } else {

          do {

            nextIndex =
              Math.floor(
                Math.random() *
                TRACK_COUNT
              );

          } while (
            nextIndex === state.track
          );
        }

      } else {

        nextIndex =
          (state.track + 1) %
          TRACK_COUNT;
      }

      loadTrack(
        nextIndex,
        autoplay
      );
    }

    function previousTrack() {

      if (audio.currentTime > 3) {

        audio.currentTime = 0;
        return;
      }

      const previousIndex =
        (
          state.track -
          1 +
          TRACK_COUNT
        ) %
        TRACK_COUNT;

      loadTrack(
        previousIndex,
        true
      );
    }

    function setExpanded(
      expanded
    ) {

      state.expanded =
        expanded;

      player.classList.toggle(
        "is-expanded",
        expanded
      );

      miniButton.setAttribute(
        "aria-expanded",
        String(expanded)
      );

      panel.setAttribute(
        "aria-hidden",
        String(!expanded)
      );

      saveState();
    }

    /* ========================================
       イベント
    ======================================== */

    miniButton.addEventListener(
      "click",
      () => {

        setExpanded(
          !player.classList.contains(
            "is-expanded"
          )
        );
      }
    );

    closeButton.addEventListener(
      "click",
      () => {
        setExpanded(false);
      }
    );

    playButton.addEventListener(
      "click",
      () => {

        if (audio.paused) {

          audio.play().catch(() => {});

        } else {

          audio.pause();
        }
      }
    );

    prevButton.addEventListener(
      "click",
      previousTrack
    );

    nextButton.addEventListener(
      "click",
      () => {
        nextTrack(true);
      }
    );

    shuffleButton.addEventListener(
      "click",
      () => {

        state.shuffle =
          !state.shuffle;

        updateModeButtons();
        saveState();
      }
    );

    repeatButton.addEventListener(
      "click",
      () => {

        state.repeat =
          !state.repeat;

        updateModeButtons();
        saveState();
      }
    );

    volume.addEventListener(
      "input",
      () => {

        state.volume =
          Number(volume.value);

        updateVolume();
        saveState();
      }
    );

    progress.addEventListener(
      "input",
      () => {

        if (
          !Number.isFinite(
            audio.duration
          )
        ) {
          return;
        }

        audio.currentTime =
          (
            Number(progress.value) /
            100
          ) *
          audio.duration;
      }
    );

    listToggle.addEventListener(
      "click",
      () => {

        const isHidden =
          trackList.hidden;

        trackList.hidden =
          !isHidden;

        listArrow.textContent =
          isHidden
            ? "⌃"
            : "⌄";

        listToggle.classList.toggle(
          "is-open",
          isHidden
        );
      }
    );

    audio.addEventListener(
      "loadedmetadata",
      () => {

        duration.textContent =
          formatTime(
            audio.duration
          );
      }
    );

    audio.addEventListener(
      "timeupdate",
      () => {

        currentTime.textContent =
          formatTime(
            audio.currentTime
          );

        if (
          Number.isFinite(
            audio.duration
          ) &&
          audio.duration > 0
        ) {

          progress.value =
            (
              audio.currentTime /
              audio.duration
            ) *
            100;
        }
      }
    );

    audio.addEventListener(
      "play",
      updatePlayState
    );

    audio.addEventListener(
      "pause",
      updatePlayState
    );

    audio.addEventListener(
      "ended",
      () => {

        if (state.repeat) {

          audio.currentTime = 0;

          audio.play().catch(
            () => {}
          );

          return;
        }

        nextTrack(true);
      }
    );

    audio.addEventListener(
      "error",
      () => {

        miniStatus.textContent =
          "ERROR";
      }
    );

    /* ========================================
       初期化
    ======================================== */

    buildTrackList();

    updateVolume();

    updateModeButtons();

    loadTrack(
      state.track,
      false
    );

    updatePlayState();

    setExpanded(
      Boolean(state.expanded)
    );
  }

  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      createPlayer
    );

  } else {

    createPlayer();
  }

})();
