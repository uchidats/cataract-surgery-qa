(() => {
  "use strict";

  // ==========================================================================
  // GAS Web API URL 設定
  // Google Apps Script をデプロイした Web アプリの URL（/exec）をここに設定してください。
  // ==========================================================================
  const SUGGEST_API_URL =
    "https://script.google.com/macros/s/AKfycbzqxq55onPpxPGjvRynPW51N9airQO4yHnVO-TFC87Nc5-ht-VxQ_tlMorbVTBxLTveHQ/exec";

  const form = document.getElementById("suggest-form");
  const successView = document.getElementById("suggest-success-view");
  const errorBox = document.getElementById("suggest-form-error");
  const submitBtn = document.getElementById("suggest-submit-btn");
  const againBtn = document.getElementById("suggest-again-btn");
  const suggestCard = document.getElementById("suggest-card");
  const clearDraftBtn = document.getElementById("suggest-clear-draft-btn");

  // 添付ファイル関連の要素
  const fileInput = document.getElementById("suggest-files");
  const fileSelectBtn = document.getElementById("suggest-file-select-btn");
  const fileCountText = document.getElementById("suggest-file-count");
  const fileDraftNotice = document.getElementById("suggest-file-draft-notice");
  const fileErrorText = document.getElementById("suggest-file-error");
  const fileList = document.getElementById("suggest-file-list");

  if (!form) return;

  const DRAFT_STORAGE_KEY = "cataractSurgeryQaSuggestDraftV1";
  const SUGGESTION_UPLOAD_FOLDER_ID =
    "1iUKs8U4igm5RtzVnBS7MSU_TyKZwFybgidStm7_0_bee3Uht-kiVnrUl9BV5_q0lpTjKL2R2";
  const MAX_FILES = 5;
  const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB (10,485,760 bytes)

  const fields = {
    chapter: document.getElementById("suggest-chapter"),
    question: document.getElementById("suggest-question"),
    choices: document.getElementById("suggest-choices"),
    correct: document.getElementById("suggest-correct"),
    explanation: document.getElementById("suggest-explanation"),
    source: document.getElementById("suggest-source"),
    author: document.getElementById("suggest-author")
  };

  const previews = {
    chapter: document.getElementById("preview-chapter"),
    question: document.getElementById("preview-question"),
    choices: document.getElementById("preview-choices"),
    correct: document.getElementById("preview-correct"),
    explanation: document.getElementById("preview-explanation"),
    source: document.getElementById("preview-source"),
    author: document.getElementById("preview-author"),
    files: document.getElementById("preview-files")
  };

  let isSubmitting = false;
  const originalSubmitText = submitBtn ? submitBtn.textContent.trim() : "提案を送信する";
  let selectedFiles = [];

  function clearErrors() {
    if (errorBox) {
      errorBox.hidden = true;
      errorBox.textContent = "";
    }
    Object.values(fields).forEach(input => {
      if (input) {
        input.classList.remove("is-invalid");
        input.removeAttribute("aria-invalid");
      }
    });
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function clearFileError() {
    if (fileErrorText) {
      fileErrorText.hidden = true;
      fileErrorText.textContent = "";
    }
  }

  function showFileError(msg) {
    if (fileErrorText) {
      fileErrorText.textContent = msg;
      fileErrorText.hidden = false;
    }
  }

  function renderFileList() {
    if (fileCountText) {
      fileCountText.textContent = `${selectedFiles.length} / ${MAX_FILES}個 選択中`;
    }
    if (!fileList) return;

    fileList.innerHTML = "";
    selectedFiles.forEach((file, index) => {
      const li = document.createElement("li");
      li.className = "file-item";

      const infoDiv = document.createElement("div");
      infoDiv.className = "file-item-info";

      const nameSpan = document.createElement("span");
      nameSpan.className = "file-item-name";
      nameSpan.title = file.name;
      nameSpan.textContent = file.name;

      const sizeSpan = document.createElement("span");
      sizeSpan.className = "file-item-size";
      sizeSpan.textContent = formatFileSize(file.size);

      infoDiv.appendChild(nameSpan);
      infoDiv.appendChild(sizeSpan);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "file-item-remove-btn";
      removeBtn.setAttribute("aria-label", `${file.name} を削除`);
      removeBtn.title = "このファイルを削除";
      removeBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      `;

      removeBtn.addEventListener("click", () => {
        if (isSubmitting) return;
        selectedFiles.splice(index, 1);
        renderFileList();
        clearFileError();
        saveDraft();
      });

      li.appendChild(infoDiv);
      li.appendChild(removeBtn);
      fileList.appendChild(li);
    });
  }

  if (fileSelectBtn && fileInput) {
    fileSelectBtn.addEventListener("click", () => {
      if (isSubmitting) return;
      fileInput.click();
    });
  }

  if (fileInput) {
    fileInput.addEventListener("change", () => {
      clearFileError();
      const newFiles = Array.from(fileInput.files || []);
      if (newFiles.length === 0) return;

      const errors = [];

      for (const file of newFiles) {
        if (file.size > MAX_FILE_SIZE_BYTES) {
          errors.push(`「${file.name}」は10MBを超えているため添付できません。`);
          continue;
        }

        if (selectedFiles.length >= MAX_FILES) {
          errors.push(`添付できるファイルは最大${MAX_FILES}個までです。`);
          break;
        }

        // 同一ファイル重複チェック
        const isDuplicate = selectedFiles.some(f => f.name === file.name && f.size === file.size);
        if (isDuplicate) continue;

        selectedFiles.push(file);
      }

      if (errors.length > 0) {
        showFileError(errors.join(" "));
      }

      if (fileDraftNotice && !fileDraftNotice.hidden) {
        fileDraftNotice.hidden = true;
      }

      fileInput.value = "";
      renderFileList();
      saveDraft();
    });
  }

  // 下書きの自動保存（Fileオブジェクト自体は保存せず、選択有無のみ保持）
  function saveDraft() {
    try {
      const draft = {
        chapter: fields.chapter ? fields.chapter.value : "",
        question: fields.question ? fields.question.value : "",
        choices: fields.choices ? fields.choices.value : "",
        correct: fields.correct ? fields.correct.value : "",
        explanation: fields.explanation ? fields.explanation.value : "",
        source: fields.source ? fields.source.value : "",
        author: fields.author ? fields.author.value : "",
        hasAttachments: selectedFiles.length > 0
      };

      const hasContent =
        Object.entries(draft).some(([k, val]) => k !== "hasAttachments" && typeof val === "string" && val.trim().length > 0) ||
        draft.hasAttachments;

      if (hasContent) {
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
      } else {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
      }
    } catch (err) {
      console.warn("Failed to save draft to localStorage:", err);
    }
  }

  // 下書きの削除
  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch (err) {
      console.warn("Failed to remove draft from localStorage:", err);
    }
  }

  // 下書きの自動復元
  function restoreDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (!draft || typeof draft !== "object") return;

      if (typeof draft.chapter === "string" && fields.chapter) {
        fields.chapter.value = draft.chapter;
      }
      if (typeof draft.question === "string" && fields.question) {
        fields.question.value = draft.question;
      }
      if (typeof draft.choices === "string" && fields.choices) {
        fields.choices.value = draft.choices;
      }
      if (typeof draft.correct === "string" && fields.correct) {
        fields.correct.value = draft.correct;
      }
      if (typeof draft.explanation === "string" && fields.explanation) {
        fields.explanation.value = draft.explanation;
      }
      if (typeof draft.source === "string" && fields.source) {
        fields.source.value = draft.source;
      }
      if (typeof draft.author === "string" && fields.author) {
        fields.author.value = draft.author;
      }

      // 下書き保存時にファイルが添付されていた場合、再選択を促す案内を表示
      if (draft.hasAttachments && fileDraftNotice) {
        fileDraftNotice.hidden = false;
      }
    } catch (err) {
      console.warn("Failed to restore draft from localStorage:", err);
    }
  }

  // 入力時にバリデーションエラーを解除＆下書き自動保存
  Object.values(fields).forEach(input => {
    if (!input) return;
    const handleFieldChange = () => {
      if (input.classList.contains("is-invalid")) {
        input.classList.remove("is-invalid");
        input.removeAttribute("aria-invalid");
      }
      if (errorBox && !errorBox.hidden) {
        errorBox.hidden = true;
      }
      saveDraft();
    };

    input.addEventListener("input", handleFieldChange);
    input.addEventListener("change", handleFieldChange);
  });

  // Base64読み取り関数
  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result || "";
        const base64Index = result.indexOf(";base64,");
        if (base64Index !== -1) {
          resolve(result.substring(base64Index + 8));
        } else {
          const commaIndex = result.indexOf(",");
          resolve(commaIndex !== -1 ? result.substring(commaIndex + 1) : result);
        }
      };
      reader.onerror = () => reject(reader.error || new Error("ファイルの読み込みに失敗しました。"));
      reader.readAsDataURL(file);
    });
  }

  // 1ファイルずつGASへアップロード
  async function uploadFileToGas(file) {
    const base64Data = await readFileAsBase64(file);
    const payload = {
      action: "uploadFile",
      folderId: SUGGESTION_UPLOAD_FOLDER_ID,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      fileSize: file.size,
      base64Data: base64Data
    };

    const response = await fetch(SUGGEST_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const data = await response.json();
    if (!data || data.ok === false) {
      throw new Error(data && data.error ? data.error : "GAS upload error");
    }

    return {
      fileId: data.fileId,
      fileName: data.fileName || file.name,
      fileUrl: data.fileUrl
    };
  }

  // GAS Web APIへのPOST送信
  async function postSuggestionToGas(payload) {
    const response = await fetch(SUGGEST_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    try {
      const data = await response.json();
      if (data && data.ok === false) {
        throw new Error(data.error || "GAS error");
      }
      return data;
    } catch (parseErr) {
      // JSON形式でない場合もHTTP 200成功として扱う
      return { ok: true };
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // 二重送信の防止
    if (isSubmitting) return;

    clearErrors();
    clearFileError();

    const errors = [];
    let firstInvalidField = null;

    if (!fields.chapter.value.trim()) {
      errors.push("単元を選択してください。");
      fields.chapter.classList.add("is-invalid");
      fields.chapter.setAttribute("aria-invalid", "true");
      if (!firstInvalidField) firstInvalidField = fields.chapter;
    }

    if (!fields.question.value.trim()) {
      errors.push("問題文案を入力してください。");
      fields.question.classList.add("is-invalid");
      fields.question.setAttribute("aria-invalid", "true");
      if (!firstInvalidField) firstInvalidField = fields.question;
    }

    if (!fields.choices.value.trim()) {
      errors.push("選択肢案を入力してください。");
      fields.choices.classList.add("is-invalid");
      fields.choices.setAttribute("aria-invalid", "true");
      if (!firstInvalidField) firstInvalidField = fields.choices;
    }

    if (!fields.correct.value.trim()) {
      errors.push("正解を入力してください。");
      fields.correct.classList.add("is-invalid");
      fields.correct.setAttribute("aria-invalid", "true");
      if (!firstInvalidField) firstInvalidField = fields.correct;
    }

    if (!fields.explanation.value.trim()) {
      errors.push("解説案を入力してください。");
      fields.explanation.classList.add("is-invalid");
      fields.explanation.setAttribute("aria-invalid", "true");
      if (!firstInvalidField) firstInvalidField = fields.explanation;
    }

    if (!fields.source.value.trim()) {
      errors.push("参照ページを入力してください。");
      fields.source.classList.add("is-invalid");
      fields.source.setAttribute("aria-invalid", "true");
      if (!firstInvalidField) firstInvalidField = fields.source;
    }

    if (errors.length > 0) {
      if (errorBox) {
        errorBox.textContent = errors.join(" ");
        errorBox.hidden = false;
      }
      if (firstInvalidField) {
        firstInvalidField.focus();
      }
      return;
    }

    // 送信中状態（ボタン無効化・テキスト変更）
    isSubmitting = true;
    if (submitBtn) {
      submitBtn.disabled = true;
    }
    if (fileSelectBtn) {
      fileSelectBtn.disabled = true;
    }

    const uploadedFiles = [];

    try {
      // 1ファイルずつ順番にアップロード
      if (selectedFiles.length > 0) {
        for (let i = 0; i < selectedFiles.length; i++) {
          const file = selectedFiles[i];
          if (submitBtn) {
            submitBtn.textContent = `ファイルをアップロードしています ${i + 1} / ${selectedFiles.length}`;
          }
          const uploaded = await uploadFileToGas(file);
          uploadedFiles.push(uploaded);
        }
      }

      // 全ファイルアップロード成功後に問題提案本文を送信
      if (submitBtn) {
        submitBtn.textContent = "提案を送信しています…";
      }

      const payload = {
        action: "submitSuggestion",
        chapter: fields.chapter.value.trim(),
        question: fields.question.value.trim(),
        choices: fields.choices.value.trim(),
        correct: fields.correct.value.trim(),
        explanation: fields.explanation.value.trim(),
        source: fields.source.value.trim(),
        author: fields.author.value.trim(),

        // 添付ファイル情報
        files: uploadedFiles,
        attachmentsSummary: uploadedFiles.map(f => `${f.fileName} (${f.fileUrl})`).join("\n"),

        // GAS側で日本語キーを直接扱う場合にも対応
        "単元": fields.chapter.value.trim(),
        "問題文案": fields.question.value.trim(),
        "選択肢案": fields.choices.value.trim(),
        "正解": fields.correct.value.trim(),
        "解説案": fields.explanation.value.trim(),
        "参照ページ": fields.source.value.trim(),
        "提案者名": fields.author.value.trim(),
        "添付ファイル": uploadedFiles.map(f => f.fileUrl).join("\n"),
        submittedAt: new Date().toISOString()
      };

      await postSuggestionToGas(payload);

      // 送信成功時のみ文章の下書きを削除
      clearDraft();
      selectedFiles = [];
      renderFileList();

      // 送信成功時：プレビュー内容をセットして完了画面へ切り替え
      if (previews.chapter) previews.chapter.textContent = payload.chapter;
      if (previews.question) previews.question.textContent = payload.question;
      if (previews.choices) previews.choices.textContent = payload.choices;
      if (previews.correct) previews.correct.textContent = payload.correct;
      if (previews.explanation) previews.explanation.textContent = payload.explanation || "（未記入）";
      if (previews.source) previews.source.textContent = payload.source || "（未記入）";
      if (previews.author) previews.author.textContent = payload.author || "（匿名）";

      if (previews.files) {
        if (uploadedFiles.length > 0) {
          const ul = document.createElement("ul");
          ul.className = "preview-files-list";
          uploadedFiles.forEach(f => {
            const li = document.createElement("li");
            const a = document.createElement("a");
            a.href = f.fileUrl;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.textContent = f.fileName;
            li.appendChild(a);
            ul.appendChild(li);
          });
          previews.files.replaceChildren(ul);
        } else {
          previews.files.textContent = "（なし）";
        }
      }

      form.hidden = true;
      if (successView) {
        successView.hidden = false;
      }

      if (suggestCard) {
        suggestCard.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } catch (err) {
      console.error("Suggestion submission failed:", err);
      if (errorBox) {
        if (uploadedFiles.length < selectedFiles.length && selectedFiles.length > 0) {
          errorBox.textContent = "添付ファイルのアップロードに失敗しました。再度お試しください。";
        } else {
          errorBox.textContent = "送信に失敗しました。時間をおいて再度お試しください。";
        }
        errorBox.hidden = false;
        errorBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    } finally {
      isSubmitting = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalSubmitText;
      }
      if (fileSelectBtn) {
        fileSelectBtn.disabled = false;
      }
    }
  });

  // 「下書きを削除」ボタンのイベント
  if (clearDraftBtn) {
    clearDraftBtn.addEventListener("click", () => {
      const confirmed = window.confirm(
        "保存されている下書きを削除しますか？\n入力中の内容はすべて消去されます。"
      );
      if (!confirmed) return;

      clearDraft();
      selectedFiles = [];
      renderFileList();
      clearFileError();
      if (fileDraftNotice) fileDraftNotice.hidden = true;
      form.reset();
      clearErrors();
    });
  }

  if (againBtn) {
    againBtn.addEventListener("click", () => {
      clearDraft();
      selectedFiles = [];
      renderFileList();
      clearFileError();
      if (fileDraftNotice) fileDraftNotice.hidden = true;
      form.reset();
      clearErrors();
      if (successView) successView.hidden = true;
      form.hidden = false;
      if (fields.chapter) fields.chapter.focus();
    });
  }

  // ==========================================================================
  // 既存問題参照機能 (Existing Questions Reference)
  // ==========================================================================
  const existingSection = document.getElementById("existing-questions-section");
  const existingTotalBadge = document.getElementById("existing-questions-total-badge");
  const existingFilterSelect = document.getElementById("existing-chapter-filter");
  const existingFilterSync = document.getElementById("existing-filter-sync");
  const existingQuestionsList = document.getElementById("existing-questions-list");
  const existingExpandAllBtn = document.getElementById("existing-expand-all-btn");
  const existingCollapseAllBtn = document.getElementById("existing-collapse-all-btn");

  function initExistingQuestions() {
    if (!existingSection || !existingQuestionsList) return;

    const questions = Array.isArray(window.QUESTIONS) ? window.QUESTIONS : [];
    const definedChapters = Array.isArray(window.CHAPTERS) ? window.CHAPTERS : [];

    // 単元リストの構築（definedChaptersを基準にしつつ、QUESTIONSに存在する単元も網羅）
    const allChapters = [...definedChapters];
    questions.forEach(q => {
      if (q && q.chapter && !allChapters.includes(q.chapter)) {
        allChapters.push(q.chapter);
      }
    });

    // 単元ごとの問題グループ化
    const chapterQuestionsMap = new Map();
    allChapters.forEach(ch => chapterQuestionsMap.set(ch, []));
    questions.forEach(q => {
      if (q && q.chapter) {
        if (!chapterQuestionsMap.has(q.chapter)) {
          chapterQuestionsMap.set(q.chapter, []);
        }
        chapterQuestionsMap.get(q.chapter).push(q);
      }
    });

    // 総問題数バッジの更新
    if (existingTotalBadge) {
      existingTotalBadge.textContent = `全${questions.length}問`;
    }

    // フィルタセレクトボックスの選択肢構築
    if (existingFilterSelect) {
      existingFilterSelect.innerHTML = `<option value="all">すべての単元を表示 (全${questions.length}問)</option>`;
      allChapters.forEach(ch => {
        const count = (chapterQuestionsMap.get(ch) || []).length;
        const opt = document.createElement("option");
        opt.value = ch;
        opt.textContent = `${ch} (${count}問)`;
        existingFilterSelect.appendChild(opt);
      });
    }

    // 単元ごとのアコーディオンDOM構築
    existingQuestionsList.innerHTML = "";
    allChapters.forEach(ch => {
      const chQuestions = chapterQuestionsMap.get(ch) || [];
      const count = chQuestions.length;

      const details = document.createElement("details");
      details.className = "existing-chapter-card";
      details.dataset.chapter = ch;

      const summary = document.createElement("summary");
      summary.className = "existing-chapter-summary";

      const nameSpan = document.createElement("span");
      nameSpan.className = "existing-chapter-name";
      nameSpan.textContent = ch;

      const activeBadge = document.createElement("span");
      activeBadge.className = "existing-chapter-active-badge";
      activeBadge.textContent = "選択中";
      activeBadge.hidden = true;

      const countSpan = document.createElement("span");
      countSpan.className = `existing-chapter-count${count === 0 ? " zero" : ""}`;
      countSpan.textContent = `${count}問`;

      summary.appendChild(nameSpan);
      summary.appendChild(activeBadge);
      summary.appendChild(countSpan);
      details.appendChild(summary);

      const body = document.createElement("div");
      body.className = "existing-chapter-body";

      if (count === 0) {
        const emptyP = document.createElement("p");
        emptyP.className = "existing-empty-text";
        emptyP.textContent = "現在この単元の問題はありません（問題募集中です！）。";
        body.appendChild(emptyP);
      } else {
        chQuestions.forEach((q, idx) => {
          const item = document.createElement("div");
          item.className = "existing-question-item";

          const header = document.createElement("div");
          header.className = "existing-question-header";

          const num = document.createElement("span");
          num.className = "existing-question-num";
          num.textContent = `問${idx + 1}`;

          const qText = document.createElement("p");
          qText.className = "existing-question-text";
          qText.textContent = q.question || "";

          header.appendChild(num);
          header.appendChild(qText);
          item.appendChild(header);

          if (Array.isArray(q.choices) && q.choices.length > 0) {
            const ol = document.createElement("ol");
            ol.className = "existing-question-choices";
            q.choices.forEach(c => {
              const li = document.createElement("li");
              li.textContent = c;
              ol.appendChild(li);
            });
            item.appendChild(ol);
          }

          body.appendChild(item);
        });
      }

      details.appendChild(body);
      existingQuestionsList.appendChild(details);
    });

    // フィルタ更新関数
    function applyFilter(selectedChapter, source) {
      const isSyncEnabled = existingFilterSync ? existingFilterSync.checked : true;
      let filterValue = existingFilterSelect ? existingFilterSelect.value : "all";

      // フォームの単元変更または連動切り替えから呼ばれた場合
      if (source === "sync" || source === "chapterChange") {
        if (isSyncEnabled) {
          if (selectedChapter && chapterQuestionsMap.has(selectedChapter)) {
            filterValue = selectedChapter;
            if (existingFilterSelect) existingFilterSelect.value = selectedChapter;
          } else {
            filterValue = "all";
            if (existingFilterSelect) existingFilterSelect.value = "all";
          }
        } else if (source === "sync") {
          // 連動がOFFにされた場合は全表示に戻す
          filterValue = "all";
          if (existingFilterSelect) existingFilterSelect.value = "all";
        }
      }

      // 各カードの表示・非表示と強調表示の適用
      const cards = existingQuestionsList.querySelectorAll(".existing-chapter-card");
      cards.forEach(card => {
        const ch = card.dataset.chapter;
        const matchesFilter = filterValue === "all" || ch === filterValue;
        const isCurrentSelected = ch === selectedChapter;

        if (matchesFilter) {
          card.classList.remove("is-hidden");
        } else {
          card.classList.add("is-hidden");
        }

        const badge = card.querySelector(".existing-chapter-active-badge");
        if (isCurrentSelected) {
          card.classList.add("is-selected-chapter");
          if (badge) badge.hidden = false;
          if (matchesFilter) {
            card.open = true; // 選択中の単元は開いておく
          }
        } else {
          card.classList.remove("is-selected-chapter");
          if (badge) badge.hidden = true;
        }
      });
    }

    // イベントリスナー登録
    if (existingFilterSelect) {
      existingFilterSelect.addEventListener("change", () => {
        const val = existingFilterSelect.value;
        const cards = existingQuestionsList.querySelectorAll(".existing-chapter-card");
        cards.forEach(card => {
          const ch = card.dataset.chapter;
          const matches = val === "all" || ch === val;
          if (matches) {
            card.classList.remove("is-hidden");
            if (val !== "all") card.open = true;
          } else {
            card.classList.add("is-hidden");
          }
        });
      });
    }

    if (existingFilterSync) {
      existingFilterSync.addEventListener("change", () => {
        applyFilter(fields.chapter ? fields.chapter.value : "", "sync");
      });
    }

    if (existingExpandAllBtn) {
      existingExpandAllBtn.addEventListener("click", () => {
        existingQuestionsList.querySelectorAll(".existing-chapter-card:not(.is-hidden)").forEach(c => {
          c.open = true;
        });
      });
    }

    if (existingCollapseAllBtn) {
      existingCollapseAllBtn.addEventListener("click", () => {
        existingQuestionsList.querySelectorAll(".existing-chapter-card").forEach(c => {
          c.open = false;
        });
      });
    }

    // フォームの単元変更時の連動
    if (fields.chapter) {
      const handleChapterSync = () => {
        applyFilter(fields.chapter.value, "chapterChange");
      };
      fields.chapter.addEventListener("change", handleChapterSync);
    }

    // 親セクションが開かれたとき、必要に応じて選択中単元の強調・展開を確認
    existingSection.addEventListener("toggle", () => {
      if (existingSection.open && fields.chapter && fields.chapter.value) {
        applyFilter(fields.chapter.value, "sync");
        const activeCard = existingQuestionsList.querySelector(".existing-chapter-card.is-selected-chapter:not(.is-hidden)");
        if (activeCard) {
          activeCard.open = true;
          setTimeout(() => {
            activeCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }, 100);
        }
      }
    });

    // 初期状態適用（下書き復元後など）
    applyFilter(fields.chapter ? fields.chapter.value : "", "sync");
  }

  // 初期化時に保存済み下書きを復元
  restoreDraft();

  // 既存問題参照機能の初期化
  initExistingQuestions();
})();
