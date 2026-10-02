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
  const draftDialog = document.getElementById("suggest-draft-dialog");
  const draftDialogCancelBtn = document.getElementById("suggest-draft-dialog-cancel");
  const draftDialogConfirmBtn = document.getElementById("suggest-draft-dialog-confirm");

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

  // 下書き削除モーダル制御関数
  function openDraftDialog() {
    if (!draftDialog) return;
    if (typeof draftDialog.showModal === "function") {
      draftDialog.showModal();
    } else {
      draftDialog.setAttribute("open", "");
    }
    if (draftDialogCancelBtn && typeof draftDialogCancelBtn.focus === "function") {
      draftDialogCancelBtn.focus();
    }
  }

  function closeDraftDialog() {
    if (!draftDialog) return;
    if (typeof draftDialog.close === "function") {
      draftDialog.close();
    } else {
      draftDialog.removeAttribute("open");
    }
    if (clearDraftBtn && typeof clearDraftBtn.focus === "function") {
      clearDraftBtn.focus();
    }
  }

  function executeClearDraft() {
    closeDraftDialog();
    clearDraft();
    selectedFiles = [];
    renderFileList();
    clearFileError();
    if (fileDraftNotice) fileDraftNotice.hidden = true;
    form.reset();
    clearErrors();
  }

  // 「下書きを削除」ボタンのイベント
  if (clearDraftBtn) {
    clearDraftBtn.addEventListener("click", () => {
      if (draftDialog) {
        openDraftDialog();
      } else {
        executeClearDraft();
      }
    });
  }

  if (draftDialogCancelBtn) {
    draftDialogCancelBtn.addEventListener("click", closeDraftDialog);
  }

  if (draftDialogConfirmBtn) {
    draftDialogConfirmBtn.addEventListener("click", executeClearDraft);
  }

  if (draftDialog) {
    draftDialog.addEventListener("click", (e) => {
      if (e.target === draftDialog) {
        closeDraftDialog();
      }
    });
    draftDialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      closeDraftDialog();
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
  const existingQuestionsList = document.getElementById("existing-questions-list");

  // 画像プレビューモーダル
  const existingImageDialog = document.getElementById("existing-image-dialog");
  const existingImageDialogImg = document.getElementById("existing-image-dialog-img");
  const existingImageDialogClose = document.getElementById("existing-image-dialog-close");

  function openExistingImagePreview(src, altText) {
    if (!existingImageDialog || !existingImageDialogImg) {
      window.open(src, "_blank", "noopener,noreferrer");
      return;
    }
    existingImageDialogImg.src = src;
    existingImageDialogImg.alt = altText || "拡大画像";
    if (typeof existingImageDialog.showModal === "function") {
      existingImageDialog.showModal();
    } else {
      existingImageDialog.setAttribute("open", "");
    }
  }

  function closeExistingImagePreview() {
    if (!existingImageDialog) return;
    if (typeof existingImageDialog.close === "function") {
      existingImageDialog.close();
    } else {
      existingImageDialog.removeAttribute("open");
    }
    if (existingImageDialogImg) existingImageDialogImg.src = "";
  }

  if (existingImageDialogClose) {
    existingImageDialogClose.addEventListener("click", closeExistingImagePreview);
  }
  if (existingImageDialog) {
    existingImageDialog.addEventListener("click", (e) => {
      if (e.target === existingImageDialog) {
        closeExistingImagePreview();
      }
    });
    existingImageDialog.addEventListener("cancel", closeExistingImagePreview);
  }

  // 既存問題用の表要素を構築
  function createExistingTableElement(tableData) {
    if (!tableData || typeof tableData !== "object") return null;

    const container = document.createElement("div");
    container.className = "existing-question-table-wrap existing-table-container";

    const table = document.createElement("table");
    table.className = "existing-table";

    // 表ヘッダー
    if (Array.isArray(tableData.headers) && tableData.headers.length > 0) {
      const thead = document.createElement("thead");
      const tr = document.createElement("tr");
      tableData.headers.forEach(headerText => {
        const th = document.createElement("th");
        th.textContent = headerText;
        tr.appendChild(th);
      });
      thead.appendChild(tr);
      table.appendChild(thead);
    }

    // 表本文
    if (Array.isArray(tableData.rows) && tableData.rows.length > 0) {
      const tbody = document.createElement("tbody");
      tableData.rows.forEach(row => {
        if (!Array.isArray(row)) return;
        const tr = document.createElement("tr");
        row.forEach(cell => {
          const td = document.createElement("td");
          const str = String(cell ?? "").trim();
          // 空欄番号（1〜9など）の場合は見やすくバッジ装飾
          if (/^[1-9]$/.test(str)) {
            td.className = "existing-table-blank-cell";
            const span = document.createElement("span");
            span.className = "existing-table-blank";
            span.textContent = str;
            td.appendChild(span);
          } else {
            td.textContent = cell !== undefined && cell !== null ? String(cell) : "";
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
    }

    container.appendChild(table);
    return container;
  }

  function initExistingQuestions() {
    if (!existingSection || !existingQuestionsList) return;

    // window.QUESTIONS または グローバルスコープの QUESTIONS から取得
    let questions = null;
    if (typeof window !== "undefined" && Array.isArray(window.QUESTIONS)) {
      questions = window.QUESTIONS;
    } else if (typeof QUESTIONS !== "undefined" && Array.isArray(QUESTIONS)) {
      questions = QUESTIONS;
    }

    let definedChapters = [];
    if (typeof window !== "undefined" && Array.isArray(window.CHAPTERS)) {
      definedChapters = window.CHAPTERS;
    } else if (typeof CHAPTERS !== "undefined" && Array.isArray(CHAPTERS)) {
      definedChapters = CHAPTERS;
    }

    // 問題データが取得できない場合に詳細なエラーを出力
    if (!Array.isArray(questions) || questions.length === 0) {
      console.error(
        "[suggest.js] QUESTIONS data could not be loaded or is empty.",
        "window.QUESTIONS:", typeof window !== "undefined" ? window.QUESTIONS : undefined,
        "typeof QUESTIONS:", typeof QUESTIONS !== "undefined" ? typeof QUESTIONS : "undefined"
      );
      if (existingTotalBadge) {
        existingTotalBadge.textContent = "全0問（読込失敗）";
        existingTotalBadge.classList.add("zero");
      }
      if (existingQuestionsList) {
        existingQuestionsList.innerHTML =
          '<p class="existing-empty-text" style="color:#c92a2a;font-weight:700;">問題データの読み込みに失敗しました。questions.js が正しく読み込まれているか確認してください。</p>';
      }
      return;
    }

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
      existingTotalBadge.classList.remove("zero");
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

      const countSpan = document.createElement("span");
      countSpan.className = `existing-chapter-count${count === 0 ? " zero" : ""}`;
      countSpan.textContent = `${count}問`;

      summary.appendChild(nameSpan);
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

          // 表（table）がある場合、問題文の直後・選択肢の前に追加
          if (q.table) {
            const tableEl = createExistingTableElement(q.table);
            if (tableEl) {
              item.appendChild(tableEl);
            }
          }

          if (Array.isArray(q.choices) && q.choices.length > 0) {
            const ol = document.createElement("ol");
            ol.className = "existing-question-choices";

            q.choices.forEach(c => {
              const li = document.createElement("li");

              let choiceText = "";
              let choiceImage = null;

              if (typeof c === "string") {
                choiceText = c;
              } else if (typeof c === "object" && c !== null) {
                choiceText = typeof c.text === "string" ? c.text : "";
                choiceImage = typeof c.image === "string" ? c.image : null;
              } else if (c !== undefined && c !== null) {
                choiceText = String(c);
              }

              const contentDiv = document.createElement("div");
              contentDiv.className = "existing-choice-content";

              // 画像がある場合（サムネイル表示）
              if (choiceImage) {
                const imgBtn = document.createElement("button");
                imgBtn.type = "button";
                imgBtn.className = "existing-choice-image-btn";
                imgBtn.title = "タップして画像を拡大表示";
                imgBtn.setAttribute("aria-label", `${choiceText || "選択肢"} 画像を拡大表示`);

                const img = document.createElement("img");
                img.src = choiceImage;
                img.alt = choiceText ? `選択肢画像 (${choiceText})` : "選択肢画像";
                img.className = "existing-choice-thumb";
                img.loading = "lazy";

                imgBtn.appendChild(img);
                imgBtn.addEventListener("click", (e) => {
                  if (e && typeof e.stopPropagation === "function") {
                    e.stopPropagation();
                  }
                  openExistingImagePreview(choiceImage, img.alt);
                });

                contentDiv.appendChild(imgBtn);
              }

              // テキストがある場合（画像のみでtextが空の場合はテキスト要素を表示しない）
              if (choiceText && choiceText.trim().length > 0) {
                const textSpan = document.createElement("span");
                textSpan.className = "existing-choice-text";
                textSpan.textContent = choiceText;
                contentDiv.appendChild(textSpan);
              }

              li.appendChild(contentDiv);
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

    // 表示単元フィルタの適用
    function applyFilter() {
      const filterValue = existingFilterSelect ? existingFilterSelect.value : "all";
      const cards = existingQuestionsList.querySelectorAll(".existing-chapter-card");
      cards.forEach(card => {
        const ch = card.dataset.chapter;
        const matches = filterValue === "all" || ch === filterValue;
        if (matches) {
          card.classList.remove("is-hidden");
          if (filterValue !== "all") {
            card.open = true; // 特定単元選択時は開いて中身を表示
          }
        } else {
          card.classList.add("is-hidden");
        }
      });
    }

    // イベントリスナー登録
    if (existingFilterSelect) {
      existingFilterSelect.addEventListener("change", applyFilter);
    }

    // 初期状態適用
    applyFilter();
  }

  // 初期化時に保存済み下書きを復元
  restoreDraft();

  // 既存問題参照機能の初期化
  initExistingQuestions();
})();
