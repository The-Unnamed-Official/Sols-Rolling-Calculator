(function (global) {
    'use strict';

    const randomToolkit = (() => {
        const toUint = value => (value >>> 0) & 0xffffffff;
        const sfc32 = (a, b, c, d) => {
            return () => {
                a = toUint(a);
                b = toUint(b);
                c = toUint(c);
                d = toUint(d);

                const t = (toUint(a + b) + d) | 0;
                d = (d + 1) | 0;
                a = b ^ (b >>> 9);
                b = (c + (c << 3)) | 0;
                c = (c << 21) | (c >>> 11);
                c = (c + t) | 0;

                return (t >>> 0) / 0x100000000;
            };
        };

        const captureSeedWord = () => {
            if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
                const buffer = new Uint32Array(1);
                crypto.getRandomValues(buffer);
                return buffer[0];
            }
            const time = Date.now();
            const wobble = Math.floor(Math.random() * 0xffffffff);
            return toUint(time ^ wobble ^ (performance.now() * 1000));
        };

        const seeds = [captureSeedWord(), captureSeedWord(), captureSeedWord(), captureSeedWord()];
        const engine = sfc32(seeds[0], seeds[1], seeds[2], seeds[3]);

        for (let i = 0; i < 12; i++) {
            engine();
        }

        return {
            sample() {
                return engine();
            },
            integer(min, max) {
                const low = Math.ceil(min);
                const high = Math.floor(max);
                if (high <= low) return low;
                const span = (high - low) + 1;
                return low + Math.floor(engine() * span);
            },
            decimal(min, max) {
                return engine() * (max - min) + min;
            }
        };
    })();

    function drawEntropy() {
        return randomToolkit.sample();
    }

    function randomIntegerBetween(min, max) {
        return randomToolkit.integer(min, max);
    }

    function randomDecimalBetween(min, max) {
        return randomToolkit.decimal(min, max);
    }

    const decimalFormatter = new Intl.NumberFormat('en-US');
    const formatWithCommas = value => decimalFormatter.format(value);

    function sanitizeNumericInput(value) {
        if (value === null || value === undefined) {
            return '';
        }
        const source = String(value);
        let result = '';
        let hasDecimal = false;
        for (const char of source) {
            if (char >= '0' && char <= '9') {
                result += char;
            } else if (char === '.' && !hasDecimal) {
                hasDecimal = true;
                result += char;
            }
        }
        if (result.startsWith('.')) {
            result = `0${result}`;
        }
        return result;
    }

    function formatSanitizedNumericString(rawValue) {
        if (!rawValue) {
            return '';
        }
        const trimmed = rawValue.endsWith('.') ? rawValue.slice(0, -1) : rawValue;
        if (!trimmed) {
            return '';
        }
        const [integerPart = '0', fractionPart = ''] = trimmed.split('.');
        const parsedInteger = Number.parseInt(integerPart, 10);
        const safeInteger = Number.isFinite(parsedInteger) ? parsedInteger : 0;
        const formattedInteger = formatWithCommas(safeInteger);
        return fractionPart ? `${formattedInteger}.${fractionPart}` : formattedInteger;
    }

    function humanizeIdentifier(value) {
        if (typeof value !== 'string' || value.length === 0) {
            return '';
        }
        const separated = value
            .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
            .replace(/([0-9])([a-zA-Z])/g, '$1 $2')
            .replace(/[-_]/g, ' ');
        return separated
            .split(/\s+/)
            .filter(Boolean)
            .map(token => token.charAt(0).toUpperCase() + token.slice(1))
            .join(' ');
    }

    function resolveSelectionLabel(selectId, value, { noneLabel = 'None', fallbackLabel = 'Unknown' } = {}) {
        if (typeof value !== 'string' || value.length === 0) {
            return fallbackLabel;
        }

        if (typeof document !== 'undefined') {
            const select = document.getElementById(selectId);
            if (select) {
                const option = Array.from(select.options).find(entry => entry.value === value);
                if (option && option.textContent) {
                    const label = option.textContent.trim();
                    if (label.length > 0) {
                        return label;
                    }
                }
            }
        }

        if (value === 'none') {
            return noneLabel;
        }

        const humanized = humanizeIdentifier(value);
        if (humanized.length > 0) {
            return humanized;
        }

        return fallbackLabel;
    }

    function setNumericInputValue(input, numericValue, { format = false, min = null, max = null } = {}) {
        if (!input) {
            return;
        }
        if (!Number.isFinite(numericValue)) {
            input.dataset.rawValue = '';
            input.value = '';
            return;
        }
        let value = numericValue;
        if (Number.isFinite(min)) {
            value = Math.max(min, value);
        }
        if (Number.isFinite(max)) {
            value = Math.min(max, value);
        }
        const raw = sanitizeNumericInput(value.toString());
        input.dataset.rawValue = raw;
        input.value = format ? formatSanitizedNumericString(raw) : raw;
    }

    function getNumericInputValue(input, { min = null, max = null } = {}) {
        if (!input) {
            return NaN;
        }
        const raw = input.dataset.rawValue ?? sanitizeNumericInput(input.value);
        if (!raw) {
            return NaN;
        }
        let numeric = Number.parseFloat(raw);
        if (!Number.isFinite(numeric)) {
            return NaN;
        }
        if (Number.isFinite(min)) {
            numeric = Math.max(min, numeric);
        }
        if (Number.isFinite(max)) {
            numeric = Math.min(max, numeric);
        }
        return numeric;
    }

    function bindNumericInputFormatting(input, { min = null, max = null } = {}) {
        if (!input) {
            return;
        }

        const sanitizeToDataset = () => {
            const sanitized = sanitizeNumericInput(input.value);
            input.dataset.rawValue = sanitized;
            input.value = sanitized;
        };

        input.addEventListener('input', () => {
            sanitizeToDataset();
        });

        input.addEventListener('focus', () => {
            const raw = input.dataset.rawValue ?? '';
            input.value = raw;
        });

        input.addEventListener('blur', () => {
            const raw = input.dataset.rawValue ?? sanitizeNumericInput(input.value);
            if (!raw) {
                input.value = '';
                return;
            }
            let numeric = Number.parseFloat(raw);
            if (!Number.isFinite(numeric)) {
                input.dataset.rawValue = '';
                input.value = '';
                return;
            }
            if (Number.isFinite(min)) {
                numeric = Math.max(min, numeric);
            }
            if (Number.isFinite(max)) {
                numeric = Math.min(max, numeric);
            }
            setNumericInputValue(input, numeric, { format: true });
        });

        const initial = sanitizeNumericInput(input.value);
        input.dataset.rawValue = initial;
        if (initial) {
            setNumericInputValue(input, Number.parseFloat(initial), { format: true, min, max });
        } else {
            input.value = '';
        }
    }

    function clamp01(value) {
        if (!Number.isFinite(value)) return 0;
        return Math.max(0, Math.min(1, value));
    }

    global.randomToolkit = randomToolkit;
    global.drawEntropy = drawEntropy;
    global.randomIntegerBetween = randomIntegerBetween;
    global.randomDecimalBetween = randomDecimalBetween;
    global.decimalFormatter = decimalFormatter;
    global.formatWithCommas = formatWithCommas;
    global.sanitizeNumericInput = sanitizeNumericInput;
    global.formatSanitizedNumericString = formatSanitizedNumericString;
    global.humanizeIdentifier = humanizeIdentifier;
    global.resolveSelectionLabel = resolveSelectionLabel;
    global.setNumericInputValue = setNumericInputValue;
    global.getNumericInputValue = getNumericInputValue;
    global.bindNumericInputFormatting = bindNumericInputFormatting;
    global.clamp01 = clamp01;
})(typeof window !== 'undefined' ? window : globalThis);
