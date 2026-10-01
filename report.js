(() => {
  "use strict";

  // ==========================================================================
  // GAS Web API URL 設定
  // Google Apps Script をデプロイした Web アプリの URL（/exec）をここに設定してください。
  // ==========================================================================
  const REPORT_API_URL =
    "https://script.google.com/macros/s/AKfycbwBrET4LLsXYUD5ZY7e4bkVEW9FPSv97QOQY_49tDj07zUF3Fi3Fqv6zB7sIt0S4PMBkg/exec";

  const form = document.getElementById("report-form");
  const successView = document.getElementById("report-success-view");
  const errorBox = document.getElementById("report-form-error");
  const submitBtn = document.getElementById("report-submit-btn");
  const againBtn = document.getElementById("report-again-btn");
  const reportCard = document.getElementById("report-card");

  // 対象問題の表示要素
  const targetIdEl = document.getElementById("report-target-id");
  const targetChapterEl = document.getElementById("report-target-chapter");
  const targetQuestionEl = document.getElementById("report-target-question");
  const targetChoicesEl = document.getElementById("report-target-choices");
  const targetFeedbackEl = document.getElementById("report-target-feedback");
  const targetSourceEl = document.getElementById("report-target-source");
  const noTargetEl = document.getElementById("report-no-target");

  // 入力要素
  const typeRadios = Array.from(document.querySelectorAll('input[name="type"]'));
  const typeOptionsContainer = document.getElementById("report-type-options");
  const detailsTextarea = document.getElementById("report-details");

  // プレビュー要素
  const previewIdEl = document.getElementById("preview-report-id");
  const previewTypeEl = document.getElementById("preview-report-type");
  const previewDetailsEl = document.getElementById("preview-report-details");

  let isSubmitting = false;
  const originalSubmitText = submitBtn ? submitBtn.textContent.trim() : "報告を送信する";

  function getSelectedType() {
    const checked = typeRadios.find(r => r.checked);
    return checked ? checked.value : "";
  }

  // URLパラメータから問題情報を取得
  const params = new URLSearchParams(window.location.search);
  let id = params.get("id") || "";
  let chapter = params.get("chapter") || "";
  let question = params.get("question") || "";
  let choices = params.get("choices") || "";
  let feedback = params.get("feedback") || "";
  let source = params.get("source") || "";

  // QUESTIONS 配列からの補完（パラメータに不足がある場合）
  if (id && Array.isArray(window.QUESTIONS)) {
    const found = window.QUESTIONS.find(q => q.id === id);
    if (found) {
      if (!chapter) chapter = found.chapter || "";
      if (!question) question = found.question || "";
      if (!choices && Array.isArray(found.choices)) {
        choices = found.choices
          .map((c, i) => `${i + 1}. ${typeof c === "string" ? c : (c?.text || "")}`)
          .join("\n");
      }
      if (!feedback) feedback = found.feedback || "";
      if (!source) source = found.source || "";
    }
  }

  const hasTargetData = !!(id || question);

  if (hasTargetData) {
    if (targetIdEl) targetIdEl.textContent = id || "（未指定）";
    if (targetChapterEl) targetChapterEl.textContent = chapter || "（未指定）";
    if (targetQuestionEl) targetQuestionEl.textContent = question || "（未指定）";
    if (targetChoicesEl) targetChoicesEl.textContent = choices || "（未指定）";
    if (targetFeedbackEl) targetFeedbackEl.textContent = feedback || "（未指定）";
    if (targetSourceEl) targetSourceEl.textContent = source || "（未指定）";
    if (noTargetEl) noTargetEl.hidden = true;
  } else {
    if (noTargetEl) noTargetEl.hidden = false;
  }

  function clearErrors() {
    if (errorBox) {
      errorBox.hidden = true;
      errorBox.textContent = "";
    }
    if (typeOptionsContainer) {
      typeOptionsContainer.classList.remove("is-invalid");
    }
    typeRadios.forEach(r => {
      r.removeAttribute("aria-invalid");
    });
    if (detailsTextarea) {
      detailsTextarea.classList.remove("is-invalid");
      detailsTextarea.removeAttribute("aria-invalid");
    }
  }

  typeRadios.forEach(radio => {
    radio.addEventListener("change", () => {
      if (typeOptionsContainer) {
        typeOptionsContainer.classList.remove("is-invalid");
      }
      typeRadios.forEach(r => r.removeAttribute("aria-invalid"));
      if (errorBox && !errorBox.hidden) {
        errorBox.hidden = true;
      }
    });
  });

  if (detailsTextarea) {
    detailsTextarea.addEventListener("input", () => {
      if (detailsTextarea.classList.contains("is-invalid")) {
        detailsTextarea.classList.remove("is-invalid");
        detailsTextarea.removeAttribute("aria-invalid");
      }
      if (errorBox && !errorBox.hidden) {
        errorBox.hidden = true;
      }
    });
  }

  // GAS Web APIへのPOST送信
  async function postReportToGas(payload) {
    const response = await fetch(REPORT_API_URL, {
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

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      // 二重送信の防止
      if (isSubmitting) return;

      clearErrors();

      const errors = [];
      let firstInvalid = null;
      const selectedType = getSelectedType();

      if (!selectedType) {
        errors.push("報告内容の種類を選択してください。");
        if (typeOptionsContainer) {
          typeOptionsContainer.classList.add("is-invalid");
        }
        typeRadios.forEach(r => r.setAttribute("aria-invalid", "true"));
        if (!firstInvalid && typeRadios[0]) firstInvalid = typeRadios[0];
      }

      if (!detailsTextarea || !detailsTextarea.value.trim()) {
        errors.push("詳細を入力してください。");
        if (detailsTextarea) {
          detailsTextarea.classList.add("is-invalid");
          detailsTextarea.setAttribute("aria-invalid", "true");
          if (!firstInvalid) firstInvalid = detailsTextarea;
        }
      }

      if (errors.length > 0) {
        if (errorBox) {
          errorBox.textContent = errors.join(" ");
          errorBox.hidden = false;
        }
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      const payload = {
        id: id || "",
        chapter: chapter || "",
        question: question || "",
        choices: choices || "",
        feedback: feedback || "",
        source: source || "",
        type: selectedType,
        details: detailsTextarea.value.trim(),

        // GAS側で日本語キーを直接扱う場合にも対応
        "問題ID": id || "",
        "単元": chapter || "",
        "問題文": question || "",
        "選択肢": choices || "",
        "解説": feedback || "",
        "参照ページ": source || "",
        "報告内容の種類": selectedType,
        "詳細": detailsTextarea.value.trim(),
        submittedAt: new Date().toISOString()
      };

      // 送信中状態（ボタン無効化・テキスト変更）
      isSubmitting = true;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "送信しています…";
      }

      try {
        await postReportToGas(payload);

        // 送信成功時：プレビュー表示の更新と画面切り替え
        if (previewIdEl) previewIdEl.textContent = id || "（未指定）";
        if (previewTypeEl) previewTypeEl.textContent = selectedType;
        if (previewDetailsEl) previewDetailsEl.textContent = detailsTextarea.value.trim();

        form.hidden = true;
        if (successView) {
          successView.hidden = false;
        }
        if (reportCard) {
          reportCard.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      } catch (err) {
        // 送信失敗時：入力内容は消さずにエラーメッセージを表示
        console.error("Report submission failed:", err);
        if (errorBox) {
          errorBox.textContent = "送信に失敗しました。時間をおいて再度お試しください。";
          errorBox.hidden = false;
          errorBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      } finally {
        isSubmitting = false;
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalSubmitText;
        }
      }
    });
  }

  if (againBtn) {
    againBtn.addEventListener("click", () => {
      clearErrors();
      if (successView) successView.hidden = true;
      if (form) form.hidden = false;
      if (detailsTextarea) detailsTextarea.focus();
    });
  }
})();
