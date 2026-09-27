/**
 * SVG Icons Repository
 */

export const ICONS = {
    bold: `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path></svg>`,
    italic: `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><line x1="19" y1="4" x2="10" y2="4"></line><line x1="14" y1="20" x2="5" y2="20"></line><line x1="15" y1="4" x2="9" y2="20"></line></svg>`,
    underline: `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"></path><line x1="4" y1="21" x2="20" y2="21"></line></svg>`,
    listUl: `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`,
    listOl: `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><line x1="10" y1="6" x2="21" y2="6"></line><line x1="10" y1="12" x2="21" y2="12"></line><line x1="10" y1="18" x2="21" y2="18"></line><path d="M4 6h1v4"></path><path d="M4 10h2"></path><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"></path></svg>`,
    undo: `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M3 7v6h6"></path><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path></svg>`,
    redo: `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M21 7v6h-6"></path><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"></path></svg>`,
    
    // Alignment Icons
    alignLeft: `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><line x1="17" y1="10" x2="3" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="17" y1="18" x2="3" y2="18"></line></svg>`,
    alignCenter: `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="10" x2="6" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="18" y1="18" x2="6" y2="18"></line></svg>`,
    alignRight: `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><line x1="21" y1="10" x2="7" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="21" y1="18" x2="7" y2="18"></line></svg>`,
    alignJustify: `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><line x1="21" y1="10" x2="3" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="21" y1="18" x2="3" y2="18"></line></svg>`,
    customMath: `<span style="font-family:serif; font-size:12px; font-weight:bold;">$f(x)$</span>`,

    // Math Icons
    fraction: `<span style="font-family:serif; font-size:12px; font-weight:bold;">a/b</span>`,
    sqrt: `<span style="font-family:serif; font-size:12px; font-weight:bold;">√x</span>`,
    power: `<span style="font-family:serif; font-size:12px; font-weight:bold;">x²</span>`,
    subscript: `<span style="font-family:serif; font-size:12px; font-weight:bold;">x₂</span>`,
    abs: `<span style="font-family:serif; font-size:12px; font-weight:bold;">|x|</span>`,
    parens: `<span style="font-family:serif; font-size:12px; font-weight:bold;">(x)</span>`,
    brackets: `<span style="font-family:serif; font-size:12px; font-weight:bold;">[x]</span>`,
    braces: `<span style="font-family:serif; font-size:12px; font-weight:bold;">{x}</span>`,
    
    // Geometry
    triangle: `<span style="font-size:12px;">△</span>`,
    angle: `<span style="font-size:12px;">∠</span>`,
    perp: `<span style="font-size:12px;">⊥</span>`,
    parallel: `<span style="font-size:12px;">∥</span>`,
    degree: `<span style="font-size:12px;">°</span>`,
    cong: `<span style="font-size:12px;">≅</span>`,
    sim: `<span style="font-size:12px;">∼</span>`,
    arc: `<span style="font-size:12px;">⌒</span>`,
    
    // Greek
    alpha: `α`, beta: `β`, gamma: `γ`, delta_sm: `δ`, delta_bg: `Δ`,
    theta: `θ`, lambda: `λ`, pi: `π`, omega: `Ω`,
    
    // Math Operations
    le: `≤`, ge: `≥`, neq: `≠`, approx: `≈`, infty: `∞`, pm: `±`, sum: `∑`, int: `∫`,
    
    // Advanced
    matrix2: `<span style="font-size:10px;">[2x2]</span>`,
    matrix3: `<span style="font-size:10px;">[3x3]</span>`,
    cases: `<span style="font-size:12px;">{</span>`,
    system2: `<span style="font-family:serif; font-size:11px; font-weight:bold;">{ 2PT</span>`,
    system3: `<span style="font-family:serif; font-size:11px; font-weight:bold;">{ 3PT</span>`
};