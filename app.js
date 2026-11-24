/* Juego autónomo en JavaScript: funciona también al abrir index.html con file://. */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const state = {
    lang: "es",
    topic: "placa",
    seconds: 200,
    statuses: [],
    given: [],
    passed: [],
    current: 0,
    timeLeft: 200,
    phase: "playing",
    feedback: null,
    timerId: null,
  };

  function normalize(text) {
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  }

  function isCorrect(input, question) {
    const answer = normalize(input);
    return Boolean(answer) && question.answers.some((item) => normalize(item) === answer);
  }

  function isPassCommand(input) {
    const value = normalize(input);
    return value === "pasapalabra" || value === "passaparaula" || value === "pass";
  }

  function nextPending(statuses, from) {
    for (let step = 1; step <= statuses.length; step += 1) {
      const index = (from + step) % statuses.length;
      if (statuses[index] === "pending") return index;
    }
    return -1;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
    })[character]);
  }

  function questions() {
    return QUESTIONS[state.topic][state.lang];
  }

  function counts() {
    const correct = state.statuses.filter((status) => status === "correct").length;
    const wrong = state.statuses.filter((status) => status === "wrong").length;
    return { correct, wrong, left: questions().length - correct - wrong };
  }

  function renderBubbles(container, statuses, passed, current) {
    container.querySelectorAll(".rosco-letter").forEach((bubble) => bubble.remove());
    const list = questions();
    const html = list.map((question, index) => {
      const angle = (-90 + (index * 360) / list.length) * (Math.PI / 180);
      const left = 50 + 44 * Math.cos(angle);
      const top = 50 + 44 * Math.sin(angle);
      const classes = ["bubble", "rosco-letter", statuses[index]];
      if (statuses[index] === "pending" && passed && passed[index]) classes.push("passed");
      if (index === current) classes.push("current");
      return `<div class="${classes.join(" ")}" style="left:${left}%;top:${top}%" aria-label="${question.letter}: ${statuses[index]}">${question.letter}</div>`;
    }).join("");
    container.insertAdjacentHTML("afterbegin", html);
  }

  function showScreen(name) {
    $("start-screen").hidden = name !== "start";
    $("game-screen").hidden = name !== "game";
    $("results-screen").hidden = name !== "results";
    window.scrollTo(0, 0);
  }

  function renderStart() {
    const t = T[state.lang];
    document.documentElement.lang = state.lang;
    document.title = `${t.tagline} · PASAPALABRA`;
    $("language-label").textContent = t.language;
    $("topic-label").textContent = t.topic;
    $("time-label").textContent = t.time;
    $("start-tagline").textContent = t.tagline;
    $("start-button").textContent = `▶  ${t.start}`;
    $("start-count").textContent = `${questions().length} · ${LANGS.find((item) => item.id === state.lang).label}`;

    document.querySelectorAll("[data-lang]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.lang === state.lang));
    });
    document.querySelectorAll("[data-topic]").forEach((button) => {
      const topic = button.dataset.topic;
      button.setAttribute("aria-pressed", String(topic === state.topic));
      button.querySelector("[data-topic-title]").textContent = t.topics[topic].title;
      button.querySelector("[data-topic-description]").textContent = t.topics[topic].desc;
    });
    document.querySelectorAll("[data-seconds]").forEach((button) => {
      button.setAttribute("aria-pressed", String(Number(button.dataset.seconds) === state.seconds));
    });

    const demo = questions().map((_, index) => index % 7 === 2 ? "correct" : index % 11 === 5 ? "wrong" : "pending");
    renderBubbles($("start-rosco"), demo, null, 0);
  }

  function prepareGameTexts() {
    const t = T[state.lang];
    $("game-topic").textContent = `${t.topics[state.topic].title} · ${state.lang.toUpperCase()}`;
    $("correct-label").textContent = t.correct;
    $("wrong-label").textContent = t.wrong;
    $("left-label").textContent = t.left;
    $("answer-input").placeholder = t.placeholder;
    $("answer-input").setAttribute("aria-label", t.placeholder);
    $("answer-input").previousElementSibling.textContent = t.placeholder;
    $("answer-button").textContent = `✓  ${t.answer}`;
    $("pass-button").textContent = `»  ${t.pass}`;
    $("quit-button").textContent = `⌂  ${t.quit}`;
    $("game-hint").textContent = t.hint;
    $("paused-label").textContent = t.paused;
    $("resume-button").textContent = `▶  ${t.resume}`;
  }

  function updateTimerAndStats() {
    const score = counts();
    const minutes = Math.floor(state.timeLeft / 60);
    const seconds = String(state.timeLeft % 60).padStart(2, "0");
    $("timer").textContent = `${minutes}:${seconds}`;
    $("timer").classList.toggle("low-time", state.timeLeft <= 20);
    $("correct-count").textContent = score.correct;
    $("wrong-count").textContent = score.wrong;
    $("left-count").textContent = score.left;
  }

  function renderFeedback() {
    const element = $("feedback");
    const feedback = state.feedback;
    element.className = "";
    if (!feedback) {
      element.textContent = "";
      return;
    }
    const t = T[state.lang];
    element.classList.add(feedback.kind);
    if (feedback.kind === "right") element.textContent = `${feedback.letter} · ${t.right}`;
    if (feedback.kind === "passed") element.textContent = `${feedback.letter} · ${t.passed}`;
    if (feedback.kind === "wrong") {
      element.innerHTML = `${escapeHtml(feedback.letter)} · ${escapeHtml(t.wasAnswer)} <span class="expected">${escapeHtml(feedback.answer)}</span>`;
    }
  }

  function updateGame() {
    const t = T[state.lang];
    const question = questions()[state.current];
    const paused = state.phase === "paused";
    renderBubbles($("game-rosco"), state.statuses, state.passed, state.current);
    updateTimerAndStats();
    $("current-letter").textContent = question.letter;
    $("question-rule").textContent = t.rule(question.mode, question.letter);
    $("question-clue").textContent = question.clue;
    $("question-clue").classList.toggle("paused", paused);
    $("answer-input").disabled = state.phase !== "playing";
    $("pass-button").disabled = state.phase !== "playing";
    $("answer-button").disabled = state.phase !== "playing" || !$("answer-input").value.trim();
    $("pause-button").textContent = paused ? `▶  ${t.resume}` : `Ⅱ  ${t.pause}`;
    $("pause-overlay").hidden = !paused;
    renderFeedback();
  }

  function startGame() {
    clearInterval(state.timerId);
    const list = questions();
    state.statuses = list.map(() => "pending");
    state.given = list.map(() => "");
    state.passed = list.map(() => false);
    state.current = 0;
    state.timeLeft = state.seconds;
    state.phase = "playing";
    state.feedback = null;
    $("answer-input").value = "";
    prepareGameTexts();
    showScreen("game");
    updateGame();
    state.timerId = setInterval(() => {
      if (state.phase !== "playing") return;
      state.timeLeft -= 1;
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        finishGame();
      } else {
        updateTimerAndStats();
      }
    }, 1000);
    $("answer-input").focus({ preventScroll: true });
  }

  function advance(nextStatuses) {
    const next = nextPending(nextStatuses, state.current);
    if (next === -1) {
      finishGame();
      return;
    }
    state.current = next;
    updateGame();
    $("answer-input").focus({ preventScroll: true });
  }

  function pass() {
    if (state.phase !== "playing") return;
    const question = questions()[state.current];
    state.passed[state.current] = true;
    state.feedback = { kind: "passed", letter: question.letter };
    $("answer-input").value = "";
    advance(state.statuses);
  }

  function submitAnswer(event) {
    event.preventDefault();
    if (state.phase !== "playing") return;
    const input = $("answer-input").value.trim();
    if (!input) return;
    if (isPassCommand(input)) {
      pass();
      return;
    }
    const question = questions()[state.current];
    const correct = isCorrect(input, question);
    state.statuses[state.current] = correct ? "correct" : "wrong";
    state.given[state.current] = input;
    state.feedback = { kind: correct ? "right" : "wrong", letter: question.letter, answer: question.answers[0] };
    $("answer-input").value = "";
    advance(state.statuses);
  }

  function togglePause() {
    if (state.phase === "finished") return;
    state.phase = state.phase === "paused" ? "playing" : "paused";
    updateGame();
    if (state.phase === "playing") $("answer-input").focus({ preventScroll: true });
  }

  function quitGame() {
    clearInterval(state.timerId);
    state.phase = "finished";
    showScreen("start");
    renderStart();
  }

  function finishGame() {
    clearInterval(state.timerId);
    state.phase = "finished";
    const t = T[state.lang];
    const list = questions();
    const score = counts();
    const perfect = score.correct === list.length;
    $("results-kicker").textContent = state.timeLeft === 0 ? t.timeUp : t.finished;
    $("results-title").innerHTML = perfect
      ? `<span class="gold">${escapeHtml(t.perfect)}</span>`
      : `<span class="score">${score.correct}</span><span class="total"> / ${list.length}</span>`;
    $("results-summary").textContent = `${t.correct}: ${score.correct} · ${t.wrong}: ${score.wrong} · ${t.left}: ${score.left}`;
    $("again-button").textContent = `↻  ${t.playAgain}`;
    $("review-title").textContent = t.review;
    renderBubbles($("results-rosco"), state.statuses, null, -1);
    $("review-list").innerHTML = list.map((question, index) => {
      const status = state.statuses[index];
      const symbol = status === "correct" ? "✓" : status === "wrong" ? "✕" : "−";
      const given = status === "wrong" && state.given[index]
        ? `<span class="review-given">${escapeHtml(state.given[index])}</span>` : "";
      return `<li class="review-item">
        <div class="bubble ${status}">${question.letter}</div>
        <div class="review-copy">
          <p class="review-answer">${symbol} ${escapeHtml(question.answers[0])}${given}</p>
          <p class="review-clue">${escapeHtml(question.clue)}</p>
        </div>
      </li>`;
    }).join("");
    showScreen("results");
  }

  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.addEventListener("click", () => { state.lang = button.dataset.lang; renderStart(); });
  });
  document.querySelectorAll("[data-topic]").forEach((button) => {
    button.addEventListener("click", () => { state.topic = button.dataset.topic; renderStart(); });
  });
  document.querySelectorAll("[data-seconds]").forEach((button) => {
    button.addEventListener("click", () => { state.seconds = Number(button.dataset.seconds); renderStart(); });
  });
  $("start-button").addEventListener("click", startGame);
  $("answer-form").addEventListener("submit", submitAnswer);
  $("answer-input").addEventListener("input", () => {
    $("answer-button").disabled = state.phase !== "playing" || !$("answer-input").value.trim();
  });
  $("pass-button").addEventListener("click", pass);
  $("pause-button").addEventListener("click", togglePause);
  $("resume-button").addEventListener("click", togglePause);
  $("quit-button").addEventListener("click", quitGame);
  $("again-button").addEventListener("click", quitGame);

  renderStart();
})();
