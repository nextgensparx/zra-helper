import { ElementNotFoundError, ElementsNotFoundError } from '../../errors';

/**
 * From an object of selectors, generates an object of elements with the same keys as the selectors object.
 * 
 * If any of the elements are missing, an `ElementsNotFoundError` is thrown.
 * @param {Object.<string, string>} selectors Object of selectors with names as keys.
 * @param {string} [customErrorMessage=null] Error message to show if any elements are missing.
 * If `$1` or `$2` appear in this string, they will be replaced with the 
 * names of the missing elements and the missing elements' selectors respectively.
 * @returns {Object.<string, HTMLElement>} An object containing HTML elements with names as keys.
 * @throws {ElementsNotFoundError}
 */
export function getElements(selectors, customErrorMessage=null) {
    /** @type {string[]} Names of missing elements. */
    const missingElements = [];
    /** @type {string[]} Selectors of missing elements. */
    const missingSelectors = [];
    const els = {};
    for (const name of Object.keys(selectors)) {
        const selector = selectors[name];
        els[name] = document.querySelector(selector);
        if (!els[name]) {
            missingElements.push(name);
            missingSelectors.push(selector);
        }
    }
    if (missingElements.length > 0) {
        let errorMessage;
        if (customErrorMessage) {
            errorMessage = customErrorMessage;
        } else {
            errorMessage = 'Failed to find the following elements: $2.';
        }
        errorMessage = errorMessage.replace('$1', `[${missingElements.join(', ')}]`);
        errorMessage = errorMessage.replace('$2', `["${missingSelectors.join('", "')}"]`);
        throw new ElementsNotFoundError(errorMessage, null, {
            selectors: missingSelectors,
        });
    } else {
        return els;
    }
}

/**
 * Gets an element using a selector and throws an `ElementNotFoundError` if it doesn't exist.
 * @param {string} selector
 * @param {string} name A descriptive name of the element. Used when generating errors.
 * @returns {HTMLElement}
 * @throws {ElementNotFoundError}
 */
export function getElement(selector, name=null) {
    const element = document.querySelector(selector);
    if (!element) {
        if (name === null) name = selector;
        throw new ElementNotFoundError(`Element "${name}" not found.`, null, {selector});
    } else {
        return element;
    }
}