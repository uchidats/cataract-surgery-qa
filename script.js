// code-yomereba-ii/assets/quiz.js の選択・出題・回答・復習フローを移植。
(() => {
  "use strict";
  const STORAGE_KEY = "cataractSurgeryQaProgressV1";
  const MAX_QUESTIONS = 10;
  const get = id => document.getElementById(id);
  const setup = get("quiz-setup");
  const panel = get("quiz-panel");
  const result = get("quiz-result");
  const categoryList = get("quiz-category-list");
  const form = get("quiz-form");
  const choices = get("quiz-choices");
  const submit = get("quiz-submit");
  const feedback = get("quiz-feedback");
  const next = get("quiz-next");
  const startBtn = get("quiz-start");
  const homeNav = get("quiz-home-nav");
  const homeBtn = get("quiz-home");
  const reportBtn = get("quiz-report");
  const verdicts = { correct: "○ 正解", incorrect: "× 不正解", unknown: "？ わからない" };
  let round = [], position = 0, answered = false, responses = [];

  function storageWarning() {
    get("storage-warning").textContent = "進捗を保存できません。このページを開いている間は学習を続けられます。";
    get("storage-warning").hidden = false;
  }
  function loadProgress() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
      return typeof data === "object" && !Array.isArray(data) ? data : {};
    } catch {
      storageWarning();
      return {};
    }
  }
  let progress = loadProgress();
  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
      get("storage-warning").hidden = true;
    } catch { storageWarning(); }
  }
  function setRecord(id, status) {
    const old = progress[id] || {};
    progress[id] = {
      // 一度正解した問題の習得状態は従来どおり維持する。
      mastered: status === "correct" || old.mastered === true,
      lastStatus: status,
      attempts: (Number.isFinite(old.attempts) ? old.attempts : 0) + 1,
      updatedAt: new Date().toISOString()
    };
    saveProgress();
    updatePoolInfo();
  }
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function normalizeChapter(name) {
    return (name || "").replace(/[\s\u3000]+/g, "").trim();
  }
  function isChapterMatch(qChapter, targetChapter) {
    const normQ = normalizeChapter(qChapter);
    const normTarget = normalizeChapter(targetChapter);
    if (normQ === normTarget) return true;
    const prefixOnly = normTarget.match(/^([①-⑳\d]+)$/);
    if (prefixOnly && normQ.startsWith(prefixOnly[1])) {
      return true;
    }
    return false;
  }
  function getQuestionsForChapter(chapter) {
    return QUESTIONS.filter(q => isChapterMatch(q.chapter, chapter));
  }
  CHAPTERS.forEach((chapter, index) => {
    const scope = getQuestionsForChapter(chapter);
    const count = scope.length;
    const label = element("label", undefined, "quiz-cat-option");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "chapter";
    input.value = chapter;
    input.checked = count > 0;
    input.disabled = count === 0;
    const badge = element("span", undefined, "quiz-cat-count");
    badge.id = `chapter-count-${index}`;
    const nameSpan = element("span", chapter, "quiz-cat-name");
    label.append(input, nameSpan, badge);
    categoryList.append(label);
  });
  function getCandidatePool() {
    const selected = [...categoryList.querySelectorAll("input:checked")].map(input => input.value);
    const mode = get("quiz-mode-list").querySelector("input:checked")?.value || "unmastered";
    const scope = QUESTIONS.filter(q => selected.some(sel => isChapterMatch(q.chapter, sel)));
    const pool = scope.filter(q => {
      const record = progress[q.id];
      if (mode === "unmastered") return !record?.mastered;
      if (mode === "all") return true;
      return record?.lastStatus === mode;
    });
    return { selected, mode, scope, pool };
  }
  function updatePoolInfo() {
    CHAPTERS.forEach((chapter, index) => {
      const scope = getQuestionsForChapter(chapter);
      const hasQuestions = scope.length > 0;
      const mastered = scope.filter(q => progress[q.id]?.mastered).length;
      const badge = get(`chapter-count-${index}`);
      if (badge) {
        badge.textContent = !hasQuestions ? "準備中" : mastered === scope.length
          ? `✓ ${mastered} / ${scope.length}問` : `未習得 ${scope.length - mastered} / ${scope.length}問`;
        badge.classList.toggle("quiz-cat-completed", hasQuestions && mastered === scope.length);
      }
      const input = categoryList.querySelector(`input[value="${chapter}"]`);
      if (input) {
        input.disabled = !hasQuestions;
        if (!hasQuestions) {
          input.checked = false;
        }
      }
    });
    get("mastery-progress").textContent = `全体の習得：${QUESTIONS.filter(q => progress[q.id]?.mastered).length} / ${QUESTIONS.length}問`;
    const { selected, mode, scope, pool } = getCandidatePool();
    get("quiz-category-error").hidden = selected.length > 0;
    startBtn.disabled = pool.length === 0;
    get("quiz-pool-info").textContent = selected.length === 0 ? "" : pool.length > 0
      ? `出題候補：${pool.length}問 → ランダム${Math.min(pool.length, MAX_QUESTIONS)}問`
      : mode === "unmastered" && scope.length > 0
        ? "選択した単元はすべて習得済みです。「全問復習」で再挑戦できます。"
        : "この条件に該当する問題はありません。";
  }
  function isMultiChoice(q) {
    return Array.isArray(q.correctIndexes);
  }
  function getCorrectIndexes(q) {
    if (isMultiChoice(q)) {
      return [...q.correctIndexes].sort((a, b) => a - b);
    }
    return [q.correctIndex];
  }
  function getChoiceText(choice) {
    if (typeof choice === "object" && choice !== null) {
      return choice.text || "";
    }
    return String(choice);
  }
  function getChoiceImage(choice) {
    if (typeof choice === "object" && choice !== null) {
      return choice.image || null;
    }
    return null;
  }
  function formatChoiceLabel(q, index) {
    const choice = q.choices[index];
    const text = getChoiceText(choice);
    const num = index + 1;
    if (!text || text === String(num)) {
      return String(num);
    }
    return `${num}. ${text}`;
  }
  function showQuestion() {
    answered = false;
    const q = round[position];
    const isMulti = isMultiChoice(q);
    get("quiz-progress").textContent = `全${round.length}問中 ${position + 1}問目`;
    get("quiz-chapter").textContent = q.chapter;
    get("quiz-question").textContent = q.question;
    feedback.hidden = true;
    next.hidden = true;
    submit.disabled = true;
    choices.disabled = false;

    const legend = choices.querySelector("legend");
    if (legend) {
      legend.textContent = isMulti ? "当てはまる答えをすべて選んでください" : "答えを1つ選んでください";
    }

    get("quiz-options").replaceChildren();
    q.choices.forEach((choice, index) => {
      const label = element("label", undefined, "quiz-option");
      const text = getChoiceText(choice);
      const imgPath = getChoiceImage(choice);

      if (imgPath) {
        label.classList.add("quiz-option-has-image");
      }

      const input = document.createElement("input");
      input.type = isMulti ? "checkbox" : "radio";
      input.name = "answer";
      input.value = String(index);
      label.append(input);

      const content = element("div", undefined, "quiz-option-content");
      if (text) {
        content.append(element("span", text, "quiz-option-text"));
      }
      if (imgPath) {
        const img = document.createElement("img");
        img.src = imgPath;
        img.alt = `選択肢 ${index + 1}`;
        img.className = "quiz-option-image";
        img.loading = "lazy";
        content.append(img);
      }
      label.append(content);

      get("quiz-options").append(label);
    });

    const unknownLabel = element("label", undefined, "quiz-option quiz-option-unknown");
    const unknownInput = document.createElement("input");
    unknownInput.type = isMulti ? "checkbox" : "radio";
    unknownInput.name = isMulti ? "unknown-option" : "answer";
    unknownInput.value = "unknown";
    unknownLabel.append(unknownInput, element("span", "わからない", "quiz-option-text"));
    get("quiz-options").append(unknownLabel);

    get("quiz-question").focus();
  }
  function start() {
    const { pool } = getCandidatePool();
    if (!pool.length) return;
    round = [...pool];
    // 参照実装と同じ Fisher–Yates。元の問題配列は変更しない。
    for (let i = round.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [round[i], round[j]] = [round[j], round[i]];
    }
    round = round.slice(0, MAX_QUESTIONS);
    position = 0;
    responses = [];
    setup.hidden = true;
    result.hidden = true;
    panel.hidden = false;
    if (homeNav) homeNav.hidden = false;
    showQuestion();
  }
  form.addEventListener("change", e => {
    if (answered) return;
    const q = round[position];
    const isMulti = isMultiChoice(q);
    const unknownInput = form.querySelector('input[value="unknown"]');

    if (e.target === unknownInput && unknownInput.checked) {
      // 「わからない」が選択されたら、通常の選択肢をすべて解除
      form.querySelectorAll('input[name="answer"]').forEach(input => {
        if (input !== unknownInput) input.checked = false;
      });
    } else if (e.target !== unknownInput && e.target.checked && unknownInput) {
      // 通常の選択肢が選択されたら、「わからない」を解除
      unknownInput.checked = false;
    }

    const isUnknown = unknownInput && unknownInput.checked;
    if (isMulti) {
      const checkedAnswers = form.querySelectorAll('input[name="answer"]:checked');
      submit.disabled = checkedAnswers.length === 0 && !isUnknown;
    } else {
      const selected = form.querySelector('input[name="answer"]:checked');
      submit.disabled = !selected && !isUnknown;
    }
  });
  function handleAnswerSubmit(forcedStatus) {
    if (answered) return;
    answered = true;
    const q = round[position];
    const isMulti = isMultiChoice(q);
    const correctAnswers = getCorrectIndexes(q);

    let status = "";
    let userAnswers = [];

    if (forcedStatus === "unknown") {
      status = "unknown";
    } else if (isMulti) {
      const checked = [...form.querySelectorAll('input[name="answer"]:checked')];
      userAnswers = checked.map(input => Number(input.value)).sort((a, b) => a - b);
      const isCorrect = userAnswers.length === correctAnswers.length &&
        userAnswers.every((val, i) => val === correctAnswers[i]);
      status = isCorrect ? "correct" : "incorrect";
    } else {
      const selected = form.querySelector('input[name="answer"]:checked');
      if (!selected) return;
      if (selected.value === "unknown") {
        status = "unknown";
      } else {
        const val = Number(selected.value);
        userAnswers = [val];
        status = val === q.correctIndex ? "correct" : "incorrect";
      }
    }

    responses.push({ question: q, selected: status === "unknown" ? "unknown" : userAnswers, status });
    setRecord(q.id, status);
    choices.disabled = true;
    submit.disabled = true;

    // 回答確定後の選択肢ハイライト
    const optionLabels = get("quiz-options").querySelectorAll(".quiz-option");
    optionLabels.forEach((label, index) => {
      if (index === q.choices.length) {
        if (status === "unknown") {
          label.classList.add("is-user-selected");
          label.append(element("span", "選択", "quiz-option-status quiz-badge-missed"));
        } else {
          label.classList.add("is-not-selected");
        }
        return;
      }

      const isCorrect = correctAnswers.includes(index);
      const isUser = userAnswers.includes(index);

      if (isCorrect && isUser) {
        label.classList.add("is-correct", "is-user-selected");
        label.append(element("span", "✓ 正解", "quiz-option-status quiz-badge-correct"));
      } else if (isCorrect && !isUser) {
        label.classList.add("is-correct", "is-missed");
        label.append(element("span", "◯ 正解", "quiz-option-status quiz-badge-correct"));
      } else if (!isCorrect && isUser) {
        label.classList.add("is-incorrect", "is-user-selected");
        label.append(element("span", "× 誤り", "quiz-option-status quiz-badge-incorrect"));
      } else {
        label.classList.add("is-not-selected");
      }
    });

    const verdictEl = get("quiz-verdict");
    if (status === "unknown") {
      verdictEl.textContent = "";
      verdictEl.hidden = true;
    } else {
      verdictEl.textContent = verdicts[status];
      verdictEl.hidden = false;
    }
    feedback.dataset.correct = String(status === "correct");
    feedback.dataset.verdict = status;

    const correctLabels = correctAnswers.map(idx => formatChoiceLabel(q, idx));
    get("quiz-correct-answer").textContent = `正解：${correctLabels.join("、 ")}`;
    get("quiz-explanation").textContent = q.feedback;
    get("quiz-source").textContent = q.source ? `『スタンダード白内障手術』 ${q.source}` : `『スタンダード白内障手術』`;
    feedback.hidden = false;
    next.textContent = position === round.length - 1 ? "結果を見る" : "次の問題";
    next.hidden = false;
    feedback.focus();
  }
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (answered) return;
    const q = round[position];
    const isMulti = isMultiChoice(q);
    const unknownInput = form.querySelector('input[value="unknown"]');
    if (unknownInput && unknownInput.checked) {
      handleAnswerSubmit("unknown");
      return;
    }
    if (!isMulti) {
      const selected = form.querySelector('input[name="answer"]:checked');
      if (!selected) return;
      handleAnswerSubmit();
    } else {
      const checkedAnswers = form.querySelectorAll('input[name="answer"]:checked');
      if (checkedAnswers.length === 0) return;
      handleAnswerSubmit();
    }
  });
  next.addEventListener("click", () => {
    if (!answered || panel.hidden) return;
    position++;
    if (position < round.length) return showQuestion();
    panel.hidden = true;
    result.hidden = false;
    const count = status => responses.filter(r => r.status === status).length;
    get("quiz-score").textContent = `${round.length}問中${count("correct")}問正解`;
    get("quiz-summary").textContent = `正解 ${count("correct")}問 ／ 不正解 ${count("incorrect")}問 ／ わからない ${count("unknown")}問`;
    const review = get("quiz-review");
    review.replaceChildren();
    const mistakes = responses.filter(r => r.status !== "correct");
    if (!mistakes.length) review.append(element("p", "今回は復習が必要な問題はありません。"));
    for (const { question: q, selected, status } of mistakes) {
      const correctAnswers = getCorrectIndexes(q);
      const card = element("article", undefined, "quiz-card quiz-review-card");

      let userText = "";
      if (status === "unknown" || selected === "unknown") {
        userText = "わからない";
      } else if (Array.isArray(selected)) {
        userText = selected.length > 0
          ? selected.map(i => formatChoiceLabel(q, i)).join("、 ")
          : "未選択";
      } else {
        userText = formatChoiceLabel(q, Number(selected));
      }

      const correctText = correctAnswers.map(i => formatChoiceLabel(q, i)).join("、 ");

      card.append(
        element("h3", q.question),
        element("p", verdicts[status]),
        element("p", `あなたの回答：${userText}`),
        element("p", `正解：${correctText}`),
        element("p", q.feedback),
        element("p", q.source ? `『スタンダード白内障手術』 ${q.source}` : `『スタンダード白内障手術』`, "quiz-source")
      );
      review.append(card);
    }
    get("quiz-score").focus();
  });
  function returnToTop() {
    result.hidden = true;
    panel.hidden = true;
    if (homeNav) homeNav.hidden = true;
    updatePoolInfo();
    setup.hidden = false;
    get("quiz-setup-heading").focus();
  }
  get("quiz-restart").addEventListener("click", returnToTop);
  if (homeBtn) {
    homeBtn.addEventListener("click", () => {
      if (!panel.hidden) {
        if (!confirm("問題を解いている途中です。中断してトップ画面に戻りますか？")) {
          return;
        }
      }
      returnToTop();
    });
  }
  function formatChoicesForReport(question) {
    if (!Array.isArray(question?.choices)) return "";
    return question.choices.map((choice, index) => {
      if (typeof choice === "string") {
        return `${index + 1}. ${choice}`;
      }

      const text = choice?.text ?? "";
      const image = choice?.image ? ` [${choice.image}]` : "";
      return `${index + 1}. ${text}${image}`;
    }).join("\n");
  }

  function openReportForm(question) {
    if (!question) return;
    const baseUrl =
      "https://docs.google.com/forms/d/e/1FAIpQLSe4ajqntE-ZyqbJ8jgaL8_tZJsM0ivYvDYEO6CiRiux5C7eeQ/viewform";

    const params = new URLSearchParams({
      usp: "pp_url",
      "entry.843181098": question.id ?? "",
      "entry.64528700": question.chapter ?? "",
      "entry.982855707": question.question ?? "",
      "entry.1187832261": formatChoicesForReport(question),
      "entry.455737619": question.feedback ?? "",
      "entry.389300495": question.source ?? ""
    });

    window.open(`${baseUrl}?${params.toString()}`, "_blank", "noopener,noreferrer");
  }
  if (reportBtn) {
    reportBtn.addEventListener("click", () => {
      openReportForm(round[position]);
    });
  }
  get("quiz-reset").addEventListener("click", () => {
    if (!confirm("すべての習得履歴・回答履歴をリセットします。よろしいですか？")) return;
    progress = {};
    saveProgress();
    updatePoolInfo();
  });
  categoryList.addEventListener("change", updatePoolInfo);
  get("quiz-mode-list").addEventListener("change", updatePoolInfo);
  startBtn.addEventListener("click", start);
  updatePoolInfo();
  setup.hidden = false;
  if (homeNav) homeNav.hidden = true;
  get("quiz-unavailable").hidden = true;
})();
