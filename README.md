# oleksiikhoriev.github.io

Hi there! If you are reading this, you probably have a lot of free time and are wondering what the hell this repo is about.

This project is the **source of truth** for my CV site: plain HTML pages plus a small script that builds a dated PDF when you use **DOWNLOAD CV** in the menu. I update the pages, push to GitHub, and GitHub Pages serves the site — no more manually editing separate PDF files. That's it!

**Live site:** [https://oleksiikhoriev.github.io/](https://oleksiikhoriev.github.io/)

**PDF:** open any page over **HTTP(S)**, then click **DOWNLOAD CV**. The browser pulls the same HTML fragments, renders them with [html2canvas](https://html2canvas.hertzen.com/), and saves `CV_Oleksii_Khoriev_YYYY-MM-DD.pdf` via [jsPDF](https://github.com/parallax/jsPDF).

Thanks for stopping by.
Cheers!
