/**
 * A reusable progress bar component with celebration animation
 */
export class ProgressBarComponent {
	/**
	 * Creates a progress bar with sparkles and celebration animation
	 * @param container - The container element to add the progress bar to
	 * @param percentage - Percentage complete
	 * @param trackClass - CSS class for the track element
	 * @param fillClass - CSS class for the fill element
	 */
	static create(
		container: HTMLElement,
		percentage: number,
		trackClass: string,
		fillClass: string
	): HTMLElement {
		// Create a wrapper that will contain both the track and the sparkles
		const wrapper = container.createDiv('progress-bar-wrapper');

		// Create the track inside the wrapper
		const track = wrapper.createDiv(trackClass);
		track.createDiv(fillClass).style.width = `${percentage}%`;

		// Add sparkles outside the track but inside the wrapper
		this.addSparkles(wrapper);

		// Trigger celebration animation when 100% complete
		if (percentage === 100) {
			this.triggerCelebration(wrapper);
		}

		return track;
	}

	/**
	 * Creates sparkle SVG elements positioned around the progress bar
	 */
	private static addSparkles(wrapper: HTMLElement) {
		const sparklesContainer = wrapper.createDiv('progress-sparkles');

		// Create 5 sparkle SVG elements
		for (let i = 0; i < 5; i++) {
			const svg = sparklesContainer.createSvg('svg');
			svg.setAttribute('viewBox', '0 0 96 96');
			svg.setAttribute('fill', 'none');
			svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

			const path = svg.createSvg('path');
			path.setAttribute('d', 'M93.781 51.578C95 50.969 96 49.359 96 48c0-1.375-1-2.969-2.219-3.578 0 0-22.868-1.514-31.781-10.422-8.915-8.91-10.438-31.781-10.438-31.781C50.969 1 49.375 0 48 0s-2.969 1-3.594 2.219c0 0-1.5 22.87-10.406 31.781-8.908 8.913-31.781 10.422-31.781 10.422C1 45.031 0 46.625 0 48c0 1.359 1 2.969 2.219 3.578 0 0 22.873 1.51 31.781 10.422 8.906 8.911 10.406 31.781 10.406 31.781C45.031 95 46.625 96 48 96s2.969-1 3.562-2.219c0 0 1.523-22.871 10.438-31.781 8.913-8.908 31.781-10.422 31.781-10.422Z');
		}
	}

	/**
	 * Triggers the celebration animation
	 */
	private static triggerCelebration(wrapper: HTMLElement) {
		// Remove celebrating class if it exists (to allow re-triggering)
		wrapper.removeClass('celebrating');

		// Force reflow to restart animation
		void wrapper.offsetWidth;

		// Add celebrating class to trigger animation
		wrapper.addClass('celebrating');

		// Remove the class after animation completes to allow re-triggering
		setTimeout(() => {
			wrapper.removeClass('celebrating');
		}, 1000);
	}
}
