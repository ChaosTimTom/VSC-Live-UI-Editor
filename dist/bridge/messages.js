"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isFromWebviewMessage = isFromWebviewMessage;
function isFromWebviewMessage(value) {
    if (!value || typeof value !== 'object')
        return false;
    const v = value;
    if (v.command === 'elementClicked') {
        const colOk = v.column === undefined || typeof v.column === 'number';
        const idOk = v.elementId === undefined || typeof v.elementId === 'string';
        return typeof v.file === 'string' && typeof v.line === 'number' && colOk && idOk;
    }
    if (v.command === 'elementSelected') {
        if (!(typeof v.file === 'string' && typeof v.line === 'number'))
            return false;
        const colOk = v.column === undefined || typeof v.column === 'number';
        if (!colOk)
            return false;
        const elementIdOk = v.elementId === undefined || typeof v.elementId === 'string';
        if (!elementIdOk)
            return false;
        const inlineOk = v.inlineStyle === undefined || typeof v.inlineStyle === 'string';
        if (!inlineOk)
            return false;
        if (v.computedStyle !== undefined) {
            if (!v.computedStyle || typeof v.computedStyle !== 'object')
                return false;
            const cs = v.computedStyle;
            for (const [k, val] of Object.entries(cs)) {
                if (typeof k !== 'string')
                    return false;
                if (typeof val !== 'string')
                    return false;
            }
        }
        if (v.elementContext === undefined)
            return true;
        if (!v.elementContext || typeof v.elementContext !== 'object')
            return false;
        const c = v.elementContext;
        if (typeof c.tagName !== 'string')
            return false;
        const ctxIdOk = c.id === undefined || typeof c.id === 'string';
        const roleOk = c.role === undefined || typeof c.role === 'string';
        const hrefOk = c.href === undefined || typeof c.href === 'string';
        const typeOk = c.type === undefined || typeof c.type === 'string';
        const textOk = c.text === undefined || typeof c.text === 'string';
        const classOk = c.classList === undefined || (Array.isArray(c.classList) && c.classList.every(x => typeof x === 'string'));
        return ctxIdOk && roleOk && hrefOk && typeOk && textOk && classOk;
    }
    if (v.command === 'targetsList') {
        if (typeof v.requestId !== 'string')
            return false;
        if (!Array.isArray(v.targets))
            return false;
        return v.targets.every(t => t && typeof t === 'object' && typeof t.file === 'string' && typeof t.line === 'number');
    }
    if (v.command === 'updateStyle') {
        if (!(typeof v.file === 'string' && typeof v.line === 'number'))
            return false;
        const colOk = v.column === undefined || typeof v.column === 'number';
        if (!colOk)
            return false;
        const idOk = v.elementId === undefined || typeof v.elementId === 'string';
        if (!idOk)
            return false;
        if (v.elementContext !== undefined) {
            if (!v.elementContext || typeof v.elementContext !== 'object')
                return false;
            const c = v.elementContext;
            if (typeof c.tagName !== 'string')
                return false;
            const idOk = c.id === undefined || typeof c.id === 'string';
            const roleOk = c.role === undefined || typeof c.role === 'string';
            const hrefOk = c.href === undefined || typeof c.href === 'string';
            const typeOk = c.type === undefined || typeof c.type === 'string';
            const textOk = c.text === undefined || typeof c.text === 'string';
            const classOk = c.classList === undefined || (Array.isArray(c.classList) && c.classList.every(x => typeof x === 'string'));
            if (!(idOk && roleOk && hrefOk && typeOk && textOk && classOk))
                return false;
        }
        if (!v.style || typeof v.style !== 'object')
            return false;
        const style = v.style;
        const widthOk = style.width === undefined || typeof style.width === 'string';
        const heightOk = style.height === undefined || typeof style.height === 'string';
        const transformOk = style.transform === undefined || typeof style.transform === 'string';
        return widthOk && heightOk && transformOk;
    }
    if (v.command === 'updateText') {
        if (!(typeof v.file === 'string' && typeof v.line === 'number' && typeof v.text === 'string'))
            return false;
        const colOk = v.column === undefined || typeof v.column === 'number';
        if (!colOk)
            return false;
        const idOk = v.elementId === undefined || typeof v.elementId === 'string';
        if (!idOk)
            return false;
        if (v.elementContext !== undefined) {
            if (!v.elementContext || typeof v.elementContext !== 'object')
                return false;
            const c = v.elementContext;
            if (typeof c.tagName !== 'string')
                return false;
            const idOk = c.id === undefined || typeof c.id === 'string';
            const roleOk = c.role === undefined || typeof c.role === 'string';
            const hrefOk = c.href === undefined || typeof c.href === 'string';
            const typeOk = c.type === undefined || typeof c.type === 'string';
            const textOk = c.text === undefined || typeof c.text === 'string';
            const classOk = c.classList === undefined || (Array.isArray(c.classList) && c.classList.every(x => typeof x === 'string'));
            if (!(idOk && roleOk && hrefOk && typeOk && textOk && classOk))
                return false;
        }
        return true;
    }
    if (v.command === 'applyPendingEdits') {
        return true;
    }
    if (v.command === 'discardPendingEdits') {
        return true;
    }
    if (v.command === 'setLayoutApply') {
        return typeof v.enabled === 'boolean';
    }
    if (v.command === 'enableStableIds') {
        return true;
    }
    return false;
}
//# sourceMappingURL=messages.js.map