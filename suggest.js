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

  if (!form) return;

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
    author: document.getElementById("preview-author")
  };

  let isSubmitting = false;
  const originalSubmitText = submitBtn ? submitBtn.textContent.trim() : "提案を送信する";

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

  // 入力時にバリデーションエラーを解除
  Object.values(fields).forEach(input => {
    if (!input) return;
    input.addEventListener("input", () => {
      if (input.classList.contains("is-invalid")) {
        input.classList.remove("is-invalid");
        input.removeAttribute("aria-invalid");
      }
      if (errorBox && !errorBox.hidden) {
        errorBox.hidden = true;
      }
    });
  });

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

    const payload = {
      chapter: fields.chapter.value.trim(),
      question: fields.question.value.trim(),
      choices: fields.choices.value.trim(),
      correct: fields.correct.value.trim(),
      explanation: fields.explanation.value.trim(),
      source: fields.source.value.trim(),
      author: fields.author.value.trim(),

      // GAS側で日本語キーを直接扱う場合にも対応
      "単元": fields.chapter.value.trim(),
      "問題文案": fields.question.value.trim(),
      "選択肢案": fields.choices.value.trim(),
      "正解": fields.correct.value.trim(),
      "解説案": fields.explanation.value.trim(),
      "参照ページ": fields.source.value.trim(),
      "提案者名": fields.author.value.trim(),
      submittedAt: new Date().toISOString()
    };

    // 送信中状態（ボタン無効化・テキスト変更）
    isSubmitting = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "送信しています…";
    }

    try {
      await postSuggestionToGas(payload);

      // 送信成功時：プレビュー内容をセットして完了画面へ切り替え
      if (previews.chapter) previews.chapter.textContent = payload.chapter;
      if (previews.question) previews.question.textContent = payload.question;
      if (previews.choices) previews.choices.textContent = payload.choices;
      if (previews.correct) previews.correct.textContent = payload.correct;
      if (previews.explanation) previews.explanation.textContent = payload.explanation || "（未記入）";
      if (previews.source) previews.source.textContent = payload.source || "（未記入）";
      if (previews.author) previews.author.textContent = payload.author || "（匿名）";

      form.hidden = true;
      if (successView) {
        successView.hidden = false;
      }

      if (suggestCard) {
        suggestCard.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } catch (err) {
      // 送信失敗時：入力内容は消さずにエラーメッセージを表示
      console.error("Suggestion submission failed:", err);
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

  if (againBtn) {
    againBtn.addEventListener("click", () => {
      form.reset();
      clearErrors();
      if (successView) successView.hidden = true;
      form.hidden = false;
      if (fields.chapter) fields.chapter.focus();
    });
  }
})();
