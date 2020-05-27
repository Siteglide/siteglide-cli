module.exports = (document) => {
	const forms = document.querySelectorAll('form[action]') && document.querySelectorAll('form[onsubmit]');
	forms.forEach(el => {
		el.action = '/__form';
		el.removeAttribute('onsubmit');
	});
};
