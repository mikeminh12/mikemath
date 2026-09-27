import { DEFAULT_CONFIG, TOOLBAR_GROUPS } from './config.js';
import { ICONS } from './icons.js';
import { CommandManager } from './command.js';
import { MathRenderer } from './renderer.js';
import { uuid, debounce } from './utils.js';

export class MathEditor {
  constructor(selector, customConfig = {}) {
    this.container = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!this.container) {
      throw new Error(`MathEditor: Không tìm thấy element với selector "${selector}"`);
    }

    this.config = { ...DEFAULT_CONFIG, ...customConfig };
    this.id = uuid();
    this.commandManager = new CommandManager(this);
    this.renderer = new MathRenderer(this.config);

    this.init();
  }

  init() {
    this.renderLayout();
    this.bindEvents();
  }

  /**
   * Dựng giao diện DOM của Editor
   */
  renderLayout() {
    this.container.classList.add('mikemath-editor-wrapper');
    this.container.setAttribute('data-theme', this.config.theme);

    // Build Toolbar HTML
    let toolbarHtml = `<div class="editor-toolbar" id="tb-${this.id}">`;
    TOOLBAR_GROUPS.forEach(group => {
      toolbarHtml += `<div class="toolbar-group" data-group="${group.id}">`;
      group.items.forEach(item => {
        const iconSvg = ICONS[item.icon] || item.label;
        const argsAttr = item.args ? `data-args="${item.args}"` : '';
        toolbarHtml += `
          <button type="button" class="editor-btn" 
                  data-cmd="${item.cmd}" ${argsAttr} 
                  title="${item.label}">
            ${iconSvg}
          </button>`;
      });
      toolbarHtml += `</div>`;
    });
    toolbarHtml += `</div>`;

    // Editor Area HTML
    const contentHtml = `
      ${toolbarHtml}
      <div class="editor-content-area">
        <div class="editor-editable" 
             contenteditable="true" 
             id="edit-${this.id}" 
             style="min-height: ${this.config.minHeight}; max-height: ${this.config.maxHeight};"
             data-placeholder="${this.config.placeholder}"></div>
      </div>
    `;

    this.container.innerHTML = contentHtml;
    this.editableEl = this.container.querySelector(`#edit-${this.id}`);
  }

  /**
   * Đăng ký sự kiện tương tác
   */
  bindEvents() {
    const toolbarEl = this.container.querySelector(`#tb-${this.id}`);

    // Delegation sự kiện cho Toolbar Buttons
    toolbarEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.editor-btn');
      if (!btn) return;

      e.preventDefault();
      const cmd = btn.getAttribute('data-cmd');
      const args = btn.getAttribute('data-args');

      if (cmd) {
        this.editableEl.focus();
        this.commandManager.execute(cmd, args);
      }
    });

    // Lắng nghe thay đổi nội dung
    const handleInput = debounce(() => {
      this.triggerChange();
    }, 150);

    this.editableEl.addEventListener('input', handleInput);
    this.editableEl.addEventListener('keyup', handleInput);

    // Set default paragraph separator to 'p'
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
    } catch (e) {}

    // Xử lý phím Enter / Shift+Enter để xuống dòng & tách đoạn văn bản chuẩn giữa chữ và công thức toán
    this.editableEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;

        const range = sel.getRangeAt(0);

        if (e.shiftKey) {
          // Shift + Enter: Chèn thẻ <br> (hard break inline)
          e.preventDefault();
          const br = document.createElement('br');
          range.deleteContents();
          range.insertNode(br);
          range.setStartAfter(br);
          range.setEndAfter(br);
          sel.removeAllRanges();
          sel.addRange(range);
          this.triggerChange();
          return;
        }

        // Enter bình thường: Tách thành 2 đoạn văn (paragraph) riêng biệt
        e.preventDefault();
        this.handleEnterKey(range);
        this.triggerChange();
      }
    });

    // Click / Double Click vào công thức để chỉnh sửa nhanh
    this.editableEl.addEventListener('dblclick', (e) => {
      const mathNode = e.target.closest('.math-formula-node');
      if (mathNode) {
        const currentLatex = mathNode.getAttribute('data-latex') || '';
        const newLatex = prompt('Chỉnh sửa công thức LaTeX:', currentLatex);
        if (newLatex !== null && newLatex.trim() !== '') {
          mathNode.setAttribute('data-latex', newLatex.trim());
          mathNode.innerHTML = this.renderer.renderLatexToHtml(newLatex.trim());
          this.triggerChange();
        }
      }
    });
  }

  /**
   * Xử lý phím Enter: Tách đoạn văn bản (Paragraph) tại vị trí con trỏ chuột
   */
  handleEnterKey(range) {
    let block = range.startContainer;
    while (block && block !== this.editableEl && block.parentNode !== this.editableEl) {
      block = block.parentNode;
    }

    if (!block || block === this.editableEl) {
      const newP = document.createElement('p');
      newP.innerHTML = '<br>';
      this.editableEl.appendChild(newP);
      
      const sel = window.getSelection();
      const newRange = document.createRange();
      newRange.setStart(newP, 0);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
      return;
    }

    const endRange = document.createRange();
    endRange.setStart(range.startContainer, range.startOffset);
    endRange.setEndAfter(block.lastChild || block);
    const fragment = endRange.extractContents();

    const newBlock = document.createElement('p');
    if (block.style.textAlign) {
      newBlock.style.textAlign = block.style.textAlign;
    }

    const hasContent = Array.from(fragment.childNodes).some(n => {
      return (n.nodeType === Node.TEXT_NODE && n.textContent.replace(/\u200B/g, '').trim() !== '') ||
             (n.nodeType === Node.ELEMENT_NODE && n.tagName !== 'BR');
    });

    if (!hasContent) {
      newBlock.innerHTML = '<br>';
    } else {
      newBlock.appendChild(fragment);
    }

    if (block.nextSibling) {
      this.editableEl.insertBefore(newBlock, block.nextSibling);
    } else {
      this.editableEl.appendChild(newBlock);
    }

    if (!block.innerHTML.trim() || block.innerHTML === '<br>') {
      block.innerHTML = '<br>';
    }

    const sel = window.getSelection();
    const newRange = document.createRange();
    newRange.setStart(newBlock, 0);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }

  /**
   * Chèn công thức LaTeX vào vị trí con trỏ chuột
   */
  insertFormula(latex) {
    const katexHtml = this.renderer.renderLatexToHtml(latex);
    const spanNode = document.createElement('span');
    spanNode.className = 'math-formula-node';
    spanNode.setAttribute('contenteditable', 'false');
    spanNode.setAttribute('data-latex', latex);
    spanNode.setAttribute('title', 'Nhấp kép để sửa mã LaTeX');
    spanNode.innerHTML = katexHtml;

    this.insertNodeAtCursor(spanNode);
    this.triggerChange();
  }

  /**
   * Helper chèn DOM Node tại vị trí con trỏ
   */
  insertNodeAtCursor(node) {
    const sel = window.getSelection();
    if (sel.getRangeAt && sel.rangeCount) {
      let range = sel.getRangeAt(0);
      
      // Đảm bảo vị trí con trỏ nằm bên trong khung editable
      if (!this.editableEl.contains(range.commonAncestorContainer)) {
        this.editableEl.focus();
        range = sel.getRangeAt(0);
      }

      range.deleteContents();
      range.insertNode(node);

      // Tạo text node phụ đằng sau node contenteditable="false" để con trỏ không bị kẹt
      let nextTextNode = node.nextSibling;
      if (!nextTextNode || nextTextNode.nodeType !== Node.TEXT_NODE) {
        nextTextNode = document.createTextNode('\u200B');
        if (node.nextSibling) {
          node.parentNode.insertBefore(nextTextNode, node.nextSibling);
        } else {
          node.parentNode.appendChild(nextTextNode);
        }
      }

      range.setStart(nextTextNode, nextTextNode.textContent.length);
      range.setEnd(nextTextNode, nextTextNode.textContent.length);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      this.editableEl.appendChild(node);
    }
  }

  /**
   * Bắn sự kiện thay đổi dữ liệu
   */
  triggerChange() {
    const htmlContent = this.editableEl.innerHTML;
    const plainText = this.editableEl.innerText;

    if (typeof this.config.onChange === 'function') {
      this.config.onChange(htmlContent, plainText, this.getJSON());
    }
  }

  /**
   * 🟢 HÀM 1: Lấy Cấu Trúc JSON Chuẩn Tiptap / MikeMath (Nguồn dữ liệu chính)
   * Firestore field: content
   */
  getJSON() {
    if (!this.editableEl) return { type: "doc", content: [] };

    const docContent = [];
    const children = Array.from(this.editableEl.childNodes);
    let currentBlockNodes = [];

    const flushBlock = (blockEl = null) => {
      const inlineNodes = [];
      
      const processInline = (node, activeMarks = []) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const rawText = node.textContent;
          const cleanText = rawText.replace(/\u200B/g, '');
          if (cleanText) {
            if (cleanText.includes('\n')) {
              const parts = cleanText.split('\n');
              parts.forEach((part, pIdx) => {
                if (part) {
                  const nodeData = { type: "text", text: part };
                  if (activeMarks.length > 0) nodeData.marks = [...activeMarks];
                  inlineNodes.push(nodeData);
                }
                if (pIdx < parts.length - 1) {
                  inlineNodes.push({ type: "hardBreak" });
                }
              });
            } else {
              const nodeData = { type: "text", text: cleanText };
              if (activeMarks.length > 0) {
                nodeData.marks = [...activeMarks];
              }
              inlineNodes.push(nodeData);
            }
          }
          return;
        }

        if (node.nodeType === Node.ELEMENT_NODE) {
          const tagName = node.tagName.toLowerCase();

          if (tagName === 'br') {
            inlineNodes.push({ type: "hardBreak" });
            return;
          }

          if (node.classList.contains('math-formula-node')) {
            const latex = node.getAttribute('data-latex') || node.innerText || '';
            inlineNodes.push({
              type: "math",
              attrs: { latex: latex.trim() }
            });
            return;
          }

          const newMarks = [...activeMarks];
          if (tagName === 'b' || tagName === 'strong' || node.style.fontWeight === 'bold') {
            if (!newMarks.some(m => m.type === 'bold')) newMarks.push({ type: 'bold' });
          }
          if (tagName === 'i' || tagName === 'em' || node.style.fontStyle === 'italic') {
            if (!newMarks.some(m => m.type === 'italic')) newMarks.push({ type: 'italic' });
          }
          if (tagName === 'u' || node.style.textDecoration.includes('underline')) {
            if (!newMarks.some(m => m.type === 'underline')) newMarks.push({ type: 'underline' });
          }

          Array.from(node.childNodes).forEach(child => processInline(child, newMarks));
        }
      };

      if (blockEl) {
        Array.from(blockEl.childNodes).forEach(child => processInline(child));
      } else {
        currentBlockNodes.forEach(node => processInline(node));
        currentBlockNodes = [];
      }

      if (inlineNodes.length > 0) {
        const paragraphObj = {
          type: "paragraph",
          content: inlineNodes
        };

        if (blockEl) {
          const align = blockEl.style.textAlign || blockEl.getAttribute('align');
          if (align && ['left', 'center', 'right', 'justify'].includes(align.toLowerCase())) {
            paragraphObj.attrs = { align: align.toLowerCase() };
          }
        }

        docContent.push(paragraphObj);
      }
    };

    children.forEach(child => {
      if (child.nodeType === Node.ELEMENT_NODE && ['div', 'p', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'li'].includes(child.tagName.toLowerCase())) {
        if (currentBlockNodes.length > 0) flushBlock();
        flushBlock(child);
      } else {
        currentBlockNodes.push(child);
      }
    });

    if (currentBlockNodes.length > 0) {
      flushBlock();
    }

    return {
      type: "doc",
      content: docContent.length > 0 ? docContent : [
        {
          type: "paragraph",
          content: [{ type: "text", text: this.getText() }]
        }
      ]
    };
  }

  /**
   * 🟢 HÀM 2: Nạp dữ liệu vào Editor (Chấp nhận JSON Doc, HTML String, hoặc Text)
   */
  setContent(data) {
    if (!this.editableEl) return;

    if (!data) {
      this.editableEl.innerHTML = '<p><br></p>';
      this.triggerChange();
      return;
    }

    // TH 1: Nạp từ Structured JSON (Tiptap Schema)
    if (typeof data === 'object' && data !== null && data.type === 'doc') {
      let html = '';
      const renderContentItem = (item) => {
        if (item.type === 'text') {
          let textHtml = this.escapeHtml(item.text);
          if (item.marks && Array.isArray(item.marks)) {
            item.marks.forEach(mark => {
              if (mark.type === 'bold') textHtml = `<b>${textHtml}</b>`;
              if (mark.type === 'italic') textHtml = `<i>${textHtml}</i>`;
              if (mark.type === 'underline') textHtml = `<u>${textHtml}</u>`;
            });
          }
          return textHtml;
        } else if (item.type === 'math') {
          const latex = item.attrs?.latex || '';
          const katexHtml = this.renderer.renderLatexToHtml(latex);
          return `<span class="math-formula-node" contenteditable="false" data-latex="${this.escapeHtml(latex)}" title="Nhấp kép để sửa mã LaTeX">${katexHtml}</span>`;
        } else if (item.type === 'hardBreak' || item.type === 'br') {
          return '<br>';
        }
        return '';
      };

      if (Array.isArray(data.content)) {
        data.content.forEach(block => {
          if (block.type === 'paragraph' || block.type === 'heading') {
            const alignStyle = block.attrs?.align ? ` style="text-align: ${block.attrs.align};"` : '';
            const innerHtml = Array.isArray(block.content) ? block.content.map(renderContentItem).join('') : '';
            html += `<p${alignStyle}>${innerHtml || '<br>'}</p>`;
          }
        });
      }

      this.editableEl.innerHTML = html || '<p><br></p>';
    } 
    // TH 2: HTML String hoặc Text
    else if (typeof data === 'string') {
      const trimmed = data.trim();
      const containsHtml = /<[a-z][\s\S]*>/i.test(trimmed);
      if (containsHtml) {
        this.editableEl.innerHTML = trimmed;
      } else {
        const lines = trimmed.split('\n');
        this.editableEl.innerHTML = lines.map(line => {
          const cleanLine = this.escapeHtml(line.trim());
          return cleanLine ? `<p>${cleanLine}</p>` : '<p><br></p>';
        }).join('');
      }
    }

    // Re-render math nodes inside editor
    this.renderer.renderAllInContainer(this.editableEl);
    this.triggerChange();
  }

  escapeHtml(str = '') {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * 🟢 HÀM TRÍCH XUẤT PHỤ TRỢ: Lấy text sạch kèm LaTeX trong dấu $ (Cho Search & AI)
   * Firestore field: contentText
   */
  getCleanLatex() {
    if (!this.editableEl) return "";
    const clone = this.editableEl.cloneNode(true);
    const formulaNodes = clone.querySelectorAll('.math-formula-node');
    formulaNodes.forEach(node => {
      const latex = node.getAttribute('data-latex') || node.innerText || '';
      const textNode = document.createTextNode(` $${latex.trim()}$ `);
      node.parentNode.replaceChild(textNode, node);
    });
    return clone.innerText.replace(/\s+/g, ' ').trim();
  }

  /**
   * 🟢 HÀM TRÍCH XUẤT 3: Lấy Raw HTML (Cho render nhanh)
   * Firestore field: contentHtml
   */
  getHTML() {
    return this.editableEl ? this.editableEl.innerHTML : "";
  }

  /**
   * 🟢 HÀM TRÍCH XUẤT 4: Lấy Plain Text thuần
   */
  getText() {
    return this.editableEl ? this.editableEl.innerText : "";
  }

  /**
   * 🟢 HÀM TRÍCH XUẤT TỔNG HỢP: Lấy 3 dạng dữ liệu chuẩn schema cùng 1 lúc
   */
  getContentData() {
    return {
      content: this.getJSON(),
      contentText: this.getCleanLatex() || this.getText(),
      contentHtml: this.getHTML()
    };
  }
}

