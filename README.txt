DSA Lab - offline site
======================

Open index.html in any modern browser (Chrome, Edge, Firefox, Safari).
Everything works from the unzipped folder: problems, solutions, step-by-step
visualisers, guides with diagrams, quizzes, flashcards, search, progress
(saved in the browser's local storage).

Optional: "Run it yourself" (edit a solution and run its tests in the page)
needs the folder served over http, because browsers refuse to load the
Python WebAssembly runtime from a file:// page. If you have Python 3:

    python3 serve.py          then open http://127.0.0.1:8765

Any other static server works too (e.g. `npx serve .`, VS Code Live Server).
