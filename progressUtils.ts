export interface CheckboxCounts {
	total: number;
	checked: number;
}

export function countMarkdownCheckboxes(content: string): CheckboxCounts {
	const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	const uncheckedRegex = /(^|\n)[\t ]*[-*+]\s+\[ \]/g;
	const checkedRegex = /(^|\n)[\t ]*[-*+]\s+\[[xX]\]/g;

	const unchecked = (normalized.match(uncheckedRegex) || []).length;
	const checked = (normalized.match(checkedRegex) || []).length;

	return { total: checked + unchecked, checked };
}

export function countCheckboxesInSection(content: string, codeBlockLine: number): CheckboxCounts {
	const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

	let sectionStart = 0;
	let sectionLevel = 0;
	let foundHeading = false;

	for (let i = codeBlockLine - 1; i >= 0; i--) {
		const headingMatch = (lines[i] ?? '').match(/^(#{1,6})\s+/);
		if (headingMatch) {
			sectionStart = i;
			sectionLevel = headingMatch[1].length;
			foundHeading = true;
			break;
		}
	}

	let sectionEnd = lines.length;
	if (foundHeading) {
		for (let i = codeBlockLine + 1; i < lines.length; i++) {
			const headingMatch = (lines[i] ?? '').match(/^(#{1,6})\s+/);
			if (headingMatch && headingMatch[1].length <= sectionLevel) {
				sectionEnd = i;
				break;
			}
		}
	}

	return countMarkdownCheckboxes(lines.slice(sectionStart, sectionEnd).join('\n'));
}
