module.exports = ($) => {
	const forms = $('form[action], form[onsubmit]');
	forms.each((i,el) => {
		el.attribs.action = '/__form';
		el.attribs.onsubmit = '';
	});
};
