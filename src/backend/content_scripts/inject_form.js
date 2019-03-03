import addContentScriptListener from './helpers/listener';

/**
 * @param {Object} message
 * @param {string} message.html
 */
async function listener(message) {
  document.body.innerHTML = message.html;
  document.getElementById('zra-helper-post-form').submit();
}
addContentScriptListener('injectForm', listener);
