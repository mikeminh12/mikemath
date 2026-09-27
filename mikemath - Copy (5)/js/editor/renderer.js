/**
 * Renderer Manager: Wraps KaTeX and MathLive rendering logic
 */

export class MathRenderer {
    constructor(options = {}) {
        this.katexOptions = options.katexOptions || { throwOnError: false };
        this.ensureKatexLoaded();
    }

    ensureKatexLoaded() {
        if (window.katex) return;

        // Auto load KaTeX CSS if not present
        if (!document.querySelector('link[href*="katex"]')) {
            const css = document.createElement('link');
            css.rel = 'stylesheet';
            css.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
            document.head.appendChild(css);
        }

        // Auto load KaTeX JS if not present
        if (!document.querySelector('script[src*="katex"]') && !window.katex) {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js';
            script.onload = () => {
                // Re-render math nodes once KaTeX is ready
                document.querySelectorAll('.math-formula-node').forEach(node => {
                    const latex = node.getAttribute('data-latex');
                    if (latex && window.katex) {
                        try {
                            node.innerHTML = window.katex.renderToString(latex, { throwOnError: false });
                        } catch (e) {}
                    }
                });
            };
            document.head.appendChild(script);
        }
    }

    /**
     * Render một đoạn chuỗi LaTeX thành HTML hiển thị bằng KaTeX
     */
    renderLatexToHtml(latex = "", isDisplayMode = false) {
        if (!latex) return "";
        if (!window.katex) {
            return `<span class="katex-error">${latex}</span>`;
        }
        try {
            const hasEnv = latex.includes('\\begin{cases}') || 
                           latex.includes('\\begin{pmatrix}') || 
                           latex.includes('\\begin{matrix}') || 
                           latex.includes('\\begin{align}');
            const isDisplay = isDisplayMode || hasEnv;
            return window.katex.renderToString(latex, {
                ...this.katexOptions,
                displayMode: isDisplay
            });
        } catch (e) {
            return `<span class="katex-error" title="${e.message}">${latex}</span>`;
        }
    }

    /**
     * Quét và render lại tất cả công thức tĩnh trong một Container
     */
    renderAllInContainer(containerEl) {
        if (!window.katex || !containerEl) return;
        
        const mathElements = containerEl.querySelectorAll('.math-formula-node, .math-formula-static');
        mathElements.forEach(el => {
            const latex = el.getAttribute('data-latex') || '';
            if (latex) {
                const isDisplay = el.getAttribute('data-display') === 'true';
                el.innerHTML = this.renderLatexToHtml(latex, isDisplay);
            }
        });
    }
}