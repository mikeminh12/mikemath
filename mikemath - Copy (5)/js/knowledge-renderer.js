/**
 * MIKE MATH - KNOWLEDGE BLOCK RENDERER
 * Shared Module for knowledge-detail.html and knowledge-create.html (Preview)
 * File: js/knowledge-renderer.js
 */

export const BlockRenderer = {
    /**
     * Render toàn bộ danh sách blocks theo đúng thứ tự
     * @param {Array} blocks - Danh sách block từ knowledgeArticles
     * @returns {string} HTML string
     */
    renderBlocks(blocks = []) {
        if (!Array.isArray(blocks) || blocks.length === 0) {
            return `<div class="card nohover article-section"><p class="text-muted">Bài viết chưa có nội dung.</p></div>`;
        }

        return blocks.map((block, index) => this.renderSingleBlock(block, index)).join("");
    },

    /**
     * Render từng block cụ thể dựa vào type
     */
    renderSingleBlock(block, index) {
        const blockId = `block_${index}`;
        const type = block.type || "text";

        switch (type) {
            case "definition":
                return `
                    <div id="${blockId}" class="card nohover block-card block-definition">
                        <div class="block-header">📖 Khái niệm ${block.title ? `: ${this.escapeHtml(block.title)}` : ""}</div>
                        <div class="block-body content-rich-text">${this.formatRichText(block.contentData || block.content)}</div>
                    </div>`;

            case "formula":
                return `
                    <div id="${blockId}" class="card nohover block-card block-formula">
                        <div class="block-header">🧮 Công thức ${block.title ? `- ${this.escapeHtml(block.title)}` : ""}</div>
                        <div class="formula-math">${this.formatLatex(block.latex || block.content || "")}</div>
                        ${(block.descriptionData || block.description) ? `<div class="formula-desc">${this.formatRichText(block.descriptionData || block.description)}</div>` : ""}
                    </div>`;

            case "remember":
                return `
                    <div id="${blockId}" class="card nohover block-card block-remember">
                        <div class="block-header">✔ Cần nhớ ${block.title ? `: ${this.escapeHtml(block.title)}` : ""}</div>
                        <div class="block-body content-rich-text">${this.formatRichText(block.contentData || block.content)}</div>
                    </div>`;

            case "example":
                return `
                    <div id="${blockId}" class="card nohover block-card block-example">
                        <div class="block-header">💡 Ví dụ ${block.title ? `: ${this.escapeHtml(block.title)}` : ""}</div>
                        <div class="example-problem"><strong>Đề bài:</strong> ${this.formatRichText(block.problemData || block.problem || block.contentData || block.content || "")}</div>
                        ${(block.solutionData || block.solution) ? `<div class="example-solution"><strong>Lời giải:</strong> ${this.formatRichText(block.solutionData || block.solution)}</div>` : ""}
                    </div>`;

            case "image": {
                let imgList = [];
                if (Array.isArray(block.images) && block.images.length > 0) {
                    imgList = block.images.filter(img => img && (img.url || img.tempUrl));
                } else if (block.url) {
                    imgList = [{ url: block.url, caption: block.caption || "" }];
                }

                if (imgList.length === 0) return "";

                const itemsHtml = imgList.map((img) => {
                    const imgSrc = img.url || img.tempUrl || "";
                    const cap = img.caption || (imgList.length === 1 ? block.caption : "");
                    return `
                        <figure class="article-image-wrapper">
                            <img src="${this.escapeHtml(imgSrc)}" alt="${this.escapeHtml(cap || 'Hình ảnh')}" onclick="window.openImageModal('${this.escapeHtml(imgSrc)}')">
                            ${cap ? `<figcaption>${this.escapeHtml(cap)}</figcaption>` : ""}
                        </figure>
                    `;
                }).join("");

                return `
                    <div id="${blockId}" class="card nohover block-card block-image">
                        <div class="image-block-grid ${imgList.length > 1 ? 'multi-images' : ''}">
                            ${itemsHtml}
                        </div>
                    </div>`;
            }

            case "quote":
                return `
                    <div id="${blockId}" class="card nohover block-card block-quote">
                        <blockquote class="article-blockquote">
                            ${this.formatRichText(block.contentData || block.content)}
                            ${block.author ? `<cite>- ${this.escapeHtml(block.author)}</cite>` : ""}
                        </blockquote>
                    </div>`;

            case "code":
                return `
                    <div id="${blockId}" class="card nohover block-card block-code">
                        ${block.language ? `<div class="code-lang-tag">${this.escapeHtml(block.language)}</div>` : ""}
                        <pre><code>${this.escapeHtml(block.code || block.content || "")}</code></pre>
                    </div>`;

            case "video":
                return `
                    <div id="${blockId}" class="card nohover block-card block-video">
                        <div class="video-embed-container">
                            <iframe src="${this.escapeHtml(block.url)}" frameborder="0" allowfullscreen></iframe>
                        </div>
                        ${block.caption ? `<p class="video-caption">${this.escapeHtml(block.caption)}</p>` : ""}
                    </div>`;

            case "text":
            default:
                return `
                    <div id="${blockId}" class="card nohover block-card block-text">
                        ${block.title ? `<h3 class="block-title">${this.escapeHtml(block.title)}</h3>` : ""}
                        <div class="block-body content-rich-text">${this.formatRichText(block.contentData || block.content)}</div>
                    </div>`;
        }
    },

    /**
     * Tạo danh sách TOC tự động dựa trên các blocks
     */
    generateTOC(blocks = []) {
        if (!Array.isArray(blocks) || blocks.length === 0) return "";

        const typeLabels = {
            definition: "📖 Khái niệm",
            formula: "🧮 Công thức",
            remember: "✔ Cần nhớ",
            example: "💡 Ví dụ",
            image: "🖼️ Hình ảnh",
            quote: "💬 Trích dẫn",
            code: "💻 Code",
            video: "🎥 Video",
            text: "📄 Nội dung"
        };

        return blocks.map((b, i) => {
            const label = b.title 
                ? `${typeLabels[b.type] || '📄'} ${this.escapeHtml(b.title)}`
                : `${typeLabels[b.type] || '📄 Block'} #${i + 1}`;
            return `<li><a href="#block_${i}">${label}</a></li>`;
        }).join("");
    },

    /**
     * Kích hoạt rendering cho KaTeX và MathJax
     * Tự động chờ KaTeX tải xong nếu chưa sẵn sàng.
     */
    typesetMath(containerEl) {
        const el = containerEl || document;
        const doRender = () => {
            if (!window.katex) return;
            // 1. Re-render tất cả .math-formula-node có data-latex
            el.querySelectorAll('.math-formula-node[data-latex]').forEach(node => {
                const latex = node.getAttribute('data-latex');
                if (!latex) return;
                try {
                    const isDisplay = /\\begin\{(cases|pmatrix|matrix|align|aligned|gather)\}/.test(latex);
                    node.innerHTML = window.katex.renderToString(latex, { throwOnError: false, displayMode: isDisplay });
                } catch (e) {
                    console.warn("KaTeX typeset error:", e);
                }
            });

            // 2. KaTeX auto-render extension (nếu khả dụng)
            if (typeof window.renderMathInElement === 'function') {
                try {
                    window.renderMathInElement(el, {
                        delimiters: [
                            {left: '$$', right: '$$', display: true},
                            {left: '$', right: '$', display: false},
                            {left: '\\(', right: '\\)', display: false},
                            {left: '\\[', right: '\\]', display: true}
                        ],
                        throwOnError: false,
                        ignoredClasses: ['math-formula-node', 'katex', 'katex-html', 'katex-mathml']
                    });
                } catch (e) {
                    console.warn("renderMathInElement error:", e);
                }
            } else {
                // 3. Fallback KaTeX inline parser cho $...$ và $$...$$
                this._renderInlineKatexInElement(el);
            }
        };

        if (window.katex) {
            doRender();
        } else {
            document.addEventListener('katexReady', doRender, { once: true });
            setTimeout(() => { if (window.katex) doRender(); }, 1000);
        }

        // 4. MathJax cho công thức tĩnh ($$...$$, $...$)
        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([el]).catch(err => console.warn("MathJax error:", err));
        }
    },

    /**
     * Fallback parse và render KaTeX cho các thẻ chứa $...$ hoặc $$...$$
     */
    _renderInlineKatexInElement(el) {
        if (!window.katex || !el) return;
        const targets = el.querySelectorAll('.formula-math, .content-rich-text, .block-body, .example-problem, .example-solution, p, li, td, th');
        targets.forEach(target => {
            if (target.querySelector('.katex')) return; // Đã render xong
            let html = target.innerHTML;
            if (!html || !html.includes('$')) return;

            // Render display math $$...$$
            html = html.replace(/\$\$(.*?)\$\$/g, (match, tex) => {
                try {
                    return window.katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false });
                } catch (e) {
                    return match;
                }
            });

            // Render inline math $...$
            html = html.replace(/\$([^\$\n]+?)\$/g, (match, tex) => {
                try {
                    return window.katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false });
                } catch (e) {
                    return match;
                }
            });

            target.innerHTML = html;
        });
    },

    /**
     * Format LaTeX cho block "formula" - bọc delimiter MathJax
     */
    formatLatex(rawStr = "") {
        if (!rawStr) return "";
        const trimmed = String(rawStr).trim();
        if (trimmed.startsWith("$") || trimmed.startsWith("\\(") || trimmed.startsWith("\\[")) {
            return trimmed;
        }
        // Môi trường phức tạp → display mode $$
        const isDisplayEnv = /\\begin\{(cases|pmatrix|matrix|align|aligned|gather)\}/.test(trimmed);
        return isDisplayEnv ? `$$${trimmed}$$` : `$${trimmed}$`;
    },

    /**
     * Chuyển đổi nội dung block thành HTML:
     * - JSON doc (từ MathEditor.getJSON()) → render full với marks và math
     * - HTML string → chèn trực tiếp (typesetMath sẽ re-render math-formula-node)
     * - Plain text → chuyển \n thành <br>
     */
    formatRichText(data = "") {
        if (!data) return "";

        // TH 1: JSON doc structure
        if (typeof data === 'object' && data !== null && data.type === 'doc' && Array.isArray(data.content)) {
            return this._renderDocJson(data);
        }

        let str = String(data);

        // Chuẩn hóa thẻ <br> dạng text và xuống dòng
        str = str.replace(/<br\s*\/?>/gi, "\n");

        // Parse Markdown formatting (Headings, Bold, Italic, Quotes, Lists)
        return this.renderMarkdown(str);
    },

    /**
     * Parse Markdown súc tích thành HTML chuẩn
     */
    renderMarkdown(md = "") {
        if (!md) return "";
        let str = String(md);

        // Headers: ### H3, ## H2, # H1
        str = str.replace(/^### (.*$)/gim, '<h4 style="color:#0f172a; font-weight:800; margin:16px 0 6px 0;">$1</h4>');
        str = str.replace(/^## (.*$)/gim, '<h3 style="color:#0f172a; font-weight:900; margin:18px 0 8px 0;">$1</h3>');
        str = str.replace(/^# (.*$)/gim, '<h2 style="color:#0f172a; font-weight:900; margin:20px 0 10px 0;">$1</h2>');

        // Blockquotes: > Quote
        str = str.replace(/^> (.*$)/gim, '<blockquote style="border-left:4px solid #0284c7; background:#f0f9ff; padding:8px 14px; margin:10px 0; border-radius:0 8px 8px 0; color:#0369a1; font-weight:600;">$1</blockquote>');

        // Bold: **text**
        str = str.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // Italic: *text* (avoid matching math)
        str = str.replace(/(^|[^\*])\*(?!\*)(.*?)\*(?!\*)/g, '$1<em>$2</em>');

        // Unordered list items: * item or - item
        str = str.replace(/^\s*[\*\-] (.*$)/gim, '<li style="margin-left:20px; list-style-type:disc;">$1</li>');

        // Replace newlines with <br>
        str = str.replace(/\n/g, '<br>');

        // Clean up redundant <br> tags after block elements
        str = str.replace(/(<\/h[1-4]>|<\/blockquote>|<\/li>)\s*<br\s*\/?>/gi, '$1');

        return str;
    },

    /**
     * Render JSON doc (Tiptap schema) → HTML string
     */
    _renderDocJson(doc) {
        if (!doc || !Array.isArray(doc.content)) return "";
        return doc.content.map(block => {
            if (block.type === 'paragraph' || block.type === 'heading') {
                const alignStyle = block.attrs?.align ? ` style="text-align: ${block.attrs.align};"` : '';
                const inner = Array.isArray(block.content)
                    ? block.content.map(node => this._renderInlineNode(node)).join('')
                    : '';
                const tag = block.type === 'heading' ? `h${block.attrs?.level || 2}` : 'p';
                return `<${tag}${alignStyle}>${inner || '<br>'}</${tag}>`;
            }
            return '';
        }).join('');
    },

    /**
     * Render inline node (text với marks, hoặc math)
     */
    _renderInlineNode(node) {
        if (!node) return '';
        if (node.type === 'hardBreak' || node.type === 'br') {
            return '<br>';
        }
        if (node.type === 'text') {
            let h = this.escapeHtml(node.text || '');
            (node.marks || []).forEach(m => {
                if (m.type === 'bold') h = `<strong>${h}</strong>`;
                else if (m.type === 'italic') h = `<em>${h}</em>`;
                else if (m.type === 'underline') h = `<u>${h}</u>`;
            });
            return h;
        }
        if (node.type === 'math') {
            const latex = node.attrs?.latex || '';
            if (!latex) return '';
            const esc = this.escapeHtml(latex);
            if (window.katex) {
                try {
                    const isDisp = /\\begin\{(cases|pmatrix|matrix|align|aligned|gather)\}/.test(latex);
                    return `<span class="math-formula-node" data-latex="${esc}">${window.katex.renderToString(latex, { throwOnError: false, displayMode: isDisp })}</span>`;
                } catch(e) {
                    return `<span class="math-formula-node" data-latex="${esc}">${esc}</span>`;
                }
            }
            // KaTeX chưa sẵn sàng → span placeholder, typesetMath sẽ render sau
            return `<span class="math-formula-node" data-latex="${esc}">${esc}</span>`;
        }
        return '';
    },

    escapeHtml(str = "") {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
};