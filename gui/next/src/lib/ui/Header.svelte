<!-- ================================================================== -->
<script>

// imports
// ------------------------------------------------------------------------
import { page } from '$app/stores';
import { table } from '$lib/api/table';
import { state } from '$lib/state';

import Icon from '$lib/ui/Icon.svelte';



// purpose:		preload tables data into the state store for faster navigation
// returns:		loads the tables into the $state.tables (array)
// ------------------------------------------------------------------------
const preloadTables = async () => {
	if(!$state.tables.length){
		$state.tables = await table.get();
	}
}

</script>


<!-- ================================================================== -->
<style>

/* layout */
header {
	max-width: 100vw;
	padding-block: var(--space-navigation);
	position: sticky;
	top: 0;
	z-index: 100;

	border-bottom: 1px solid var(--color-frame);
	background-color: var(--color-page);
}

.wrapper {
	min-width: 0;
	width: 100%;
	padding-inline: var(--space-page);
	display: flex;
	justify-content: space-between;
	align-items: center;
	flex-wrap: wrap;
	gap: var(--space-navigation) var(--space-page);
}

/* logo */
.logo {
	min-width: 0;
	min-height: 2.5625rem;
	display: flex;
	align-items: center;
	gap: 1rem;
}

.logo .label {
	position: absolute;
	left: -100vw;
}

.logo .sign {
	width: 100%;
	min-width: 2rem;
	max-width: 3.125rem;

	transition: scale .2s var(--easing-rapid);
}

	.logo .sign:hover,
	.logo:has(.logotype:hover) .sign {
		scale: 1.1;
	}

.logo h1 {
	min-width: 2rem;
	display: flex;
	flex-direction: column;
}

.logo .logotype {
	width: 100%;
	max-width: 120px;

	fill: var(--color-text);

	transition: fill .2s var(--easing-rapid);
}

	.logo .logotype:hover,
	.logo:has(.sign:hover) .logotype {
		fill: color-mix(in srgb, var(--color-text), var(--color-text-secondary) 40%);
	}

.logo .instance {
	max-width: 260px;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: .8rem;
	color: var(--color-text-secondary);

	transition: font-size .2s ease-in-out;
}

.logo .instance.offline {
	font-size: 0;
	color: transparent;
}

.logo .instance:hover {
	color: var(--color-interaction-hover);
}

/* navigation */
ul {
	display: flex;
	gap: 1rem;
}

li a {
	padding: .8rem;
	display: flex;
	flex-direction: column;
	gap: .5rem;
	justify-items: center;
	align-items: center;
	position: relative;

	border-radius: 1rem;
	background-color: var(--color-background);

	text-transform: uppercase;
	font-size: .9rem;
	color: var(--color-text-secondary);

	transition-property: background-color, border-radius;
	transition-duration: .1s, .2s;
	transition-timing-function: linear, cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

	@media (max-width: 525px) {
		li a {
			padding: .5rem;
		}
	}

	li a:hover {
		border-radius: 1.2rem;
		background-color: var(--color-middleground);
	}

	li a.active {
		background-color: var(--color-middleground);

		color: var(--color-text);
	}

/* tooltip appearing on hover */
nav .label {
	margin-block-start: .4rem;
	padding: .2rem .5rem;
	position: absolute;
	top: 105%;
	right: 0;
	left: auto;
	bottom: auto;
	opacity: 0;

	border-radius: .2rem;
	background-color: var(--color-text);

	white-space: nowrap;
	font-weight: 500;
	color: var(--color-page);

	transition: opacity .1s ease-in-out;
}

nav .label:before {
	width: 10px;
	height: 6px;
	position: absolute;
	top: -6px;
	right: 1.25rem;

	background-color: var(--color-text);
	clip-path: polygon(50% 0%, 100% 100%, 0% 100%);

	content: '';
}

nav a:hover .label {
	opacity: 1;
}

</style>



<!-- ================================================================== -->
<header>
	<div class="wrapper">

		<div class="logo">
			<a href="/">
				<svg class="sign" viewBox="0 0 824 551" xmlns="http://www.w3.org/2000/svg" fill-rule="evenodd" clip-rule="evenodd" stroke-linejoin="round" stroke-miterlimit="1.41421"><clipPath id="a"><path d="M758.89 64.283L486.606 357.409l-57.17 128.877-148.457-171.229L758.89 64.283z"/></clipPath><g clip-path="url(#a)"><path fill="#2876ac" fill-rule="nonzero" d="M217.049 0.354H822.819V550.216H217.049z"/></g><clipPath id="b"><path d="M759.167 64.211L281.456 315.3H63.929L759.167 64.211z"/></clipPath><g clip-path="url(#b)"><path fill="#1e94e6" fill-rule="nonzero" d="M0 0.281H823.096V379.229H0z"/></g><clipPath id="c"><path d="M759.248 63.929L636.712 480.741 486.601 357.166 759.248 63.929z"/></clipPath><g clip-path="url(#c)"><path fill="#1e94e6" fill-rule="nonzero" d="M422.672 0H823.178V544.671H422.672z"/></g></svg>
			</a>
			<h1>
				<a href="/">
					<svg class="logotype" width="177" height="50" viewBox="0 0 177 50" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M3.41415 19.5784C3.39709 20.1778 3.53679 20.7711 3.8192 21.2988C4.10161 21.8264 4.51677 22.2696 5.02292 22.584C6.21818 23.3624 7.54512 23.9126 8.93757 24.207C10.4868 24.5676 12.03 24.9764 13.5672 25.4092C15.0341 25.8216 16.377 26.5939 17.4759 27.6573C18.0159 28.2096 18.437 28.8684 18.7128 29.5924C18.9886 30.3165 19.1132 31.0902 19.0787 31.8651C19.0956 32.8857 18.8722 33.8957 18.4267 34.8121C17.9813 35.7286 17.3267 36.5253 16.5166 37.1368C14.8125 38.5194 12.5781 39.2087 9.81345 39.2047C7.63154 39.2753 5.47268 38.7365 3.57503 37.6478C1.9481 36.713 0.68671 35.2453 0 33.4881L2.22248 32.1957C2.70387 33.5996 3.66775 34.7831 4.9395 35.5319C6.43045 36.3764 8.12242 36.7922 9.83133 36.7341C11.5095 36.7951 13.168 36.3538 14.598 35.4658C15.1996 35.0854 15.6911 34.5517 16.0227 33.9184C16.3543 33.2851 16.5145 32.5748 16.4868 31.8591C16.4956 31.2607 16.3543 30.6698 16.0762 30.1413C15.7981 29.6127 15.3921 29.1635 14.896 28.8355C13.7017 28.0259 12.3648 27.4546 10.9575 27.1524C9.40829 26.7918 7.86506 26.391 6.3278 25.9502C4.86356 25.5441 3.52108 24.7802 2.4191 23.7261C1.88019 23.1881 1.4591 22.5421 1.18302 21.8297C0.906942 21.1174 0.782013 20.3545 0.816298 19.5905C0.80971 18.5886 1.02888 17.5983 1.45724 16.6944C1.88561 15.7906 2.51197 14.9967 3.28903 14.3728C5.07388 12.9071 7.32938 12.1521 9.62875 12.2509C11.5229 12.2068 13.3925 12.6892 15.033 13.6455C16.5205 14.5227 17.7043 15.8407 18.4233 17.4205L16.2485 18.6647C15.7553 17.4136 14.8393 16.3787 13.6626 15.7434C12.4263 15.0628 11.037 14.715 9.62875 14.7335C8.05076 14.6777 6.49738 15.1396 5.20167 16.0499C4.63939 16.4447 4.18218 16.9732 3.87042 17.5886C3.55866 18.204 3.40195 18.8874 3.41415 19.5784Z"/>
						<path d="M24.4771 5.95734C24.0899 6.33846 23.5703 6.55179 23.0293 6.55179C22.4882 6.55179 21.9686 6.33846 21.5814 5.95734C21.3852 5.76776 21.2308 5.53866 21.1282 5.28493C21.0255 5.03121 20.9769 4.75853 20.9855 4.48462C20.9811 4.21929 21.0319 3.95597 21.1345 3.71163C21.2371 3.46729 21.3893 3.24736 21.5814 3.066C21.9686 2.68488 22.4882 2.47156 23.0293 2.47156C23.5703 2.47156 24.0899 2.68488 24.4771 3.066C24.6752 3.24418 24.8334 3.46282 24.9413 3.70741C25.0491 3.95199 25.1042 4.21693 25.1028 4.48462C25.1088 4.76093 25.056 5.03533 24.9481 5.28936C24.8402 5.54339 24.6796 5.77116 24.4771 5.95734ZM21.7363 38.6577V12.81H24.3222V38.6577H21.7363Z"/>
						<path d="M42.1795 15.3407H34.4693V32.1717C34.4693 33.6545 34.7454 34.7224 35.2975 35.3757C35.6225 35.725 36.0147 36.0038 36.4501 36.195C36.8855 36.3862 37.355 36.4858 37.8299 36.4877C39.2806 36.5703 40.7358 36.5281 42.1795 36.3615V38.6577C38.6879 39.1747 36.092 38.9322 34.3919 37.9304C32.6917 36.9285 31.8377 34.999 31.8298 32.1417V15.3407H26.1335V12.81H31.8298V6.34806L34.4693 5.57263V12.7859H42.1795V15.3407Z"/>
						<path d="M55.1211 12.239C56.8592 12.1823 58.5882 12.5146 60.184 13.212C61.7798 13.9093 63.2027 14.9545 64.3506 16.2724C66.7006 18.888 67.9784 22.3063 67.9256 25.8361C67.9256 25.9744 67.9256 26.1787 67.9256 26.4372C67.9256 26.6957 67.9256 26.9241 67.9256 27.0383H44.4019C44.6207 29.7444 45.8752 32.2582 47.8995 34.0473C49.9766 35.8431 52.643 36.7926 55.3773 36.7102C57.268 36.7521 59.1382 36.3073 60.8113 35.4178C62.281 34.6478 63.5072 33.4774 64.3506 32.0396L66.6267 33.386C65.5272 35.2046 63.9493 36.6799 62.0685 37.6479C59.9898 38.726 57.6784 39.2671 55.3415 39.2228C51.3693 39.2228 48.11 37.9565 45.5638 35.4238C43.0176 32.8911 41.7326 29.6612 41.7087 25.7339C41.6623 23.9586 41.9707 22.1921 42.6156 20.5397C43.2605 18.8873 44.2288 17.3829 45.4625 16.1162C47.965 13.5314 51.1846 12.239 55.1211 12.239ZM55.1211 14.7216C52.4102 14.6364 49.773 15.6195 47.7684 17.4626C45.7947 19.3054 44.5909 21.8374 44.4019 24.5437H65.2086C64.9345 21.4781 63.8402 19.0736 61.9255 17.3304C60.0708 15.6161 57.6362 14.6827 55.1211 14.7216Z"/>
						<path d="M93.0699 12.4374H97.5208V37.2151C97.5208 41.0462 96.2278 44.0197 93.6419 46.1356C91.0061 48.274 87.7043 49.4007 84.323 49.3154C81.7294 49.384 79.1573 48.8254 76.8213 47.6864C74.7853 46.6709 73.1176 45.0348 72.0546 43.0098L75.9872 40.7857C77.3973 43.679 80.2097 45.1257 84.4243 45.1257C87.1174 45.1257 89.2307 44.4204 90.764 43.0098C92.2973 41.5992 93.0659 39.6676 93.0699 37.2151V33.5483C90.7938 36.9947 87.5524 38.7179 83.3458 38.7179C81.5991 38.7514 79.8645 38.4194 78.2513 37.7428C76.6382 37.0661 75.1815 36.0596 73.9732 34.7866C72.7251 33.5321 71.7424 32.0348 71.0849 30.3857C70.4273 28.7366 70.1086 26.97 70.148 25.1929C70.1111 23.4251 70.4313 21.6683 71.0889 20.0293C71.7466 18.3903 72.7279 16.9035 73.9732 15.6593C75.1853 14.393 76.6432 13.3925 78.2559 12.7202C79.8685 12.048 81.6012 11.7184 83.3458 11.7521C87.5882 11.7521 90.8295 13.4593 93.0699 16.8736V12.4374ZM77.2861 31.7691C79.0619 33.4639 81.4137 34.4083 83.8582 34.4083C86.3027 34.4083 88.6545 33.4639 90.4303 31.7691C91.2965 30.9162 91.9782 29.8916 92.4325 28.7598C92.8868 27.628 93.1038 26.4135 93.0699 25.1929C93.0987 23.9828 92.8791 22.7798 92.4248 21.6595C91.9706 20.5391 91.2915 19.5257 90.4303 18.6829C88.6545 16.9881 86.3027 16.0437 83.8582 16.0437C81.4137 16.0437 79.0619 16.9881 77.2861 18.6829C76.4261 19.5266 75.7478 20.5402 75.2936 21.6603C74.8394 22.7804 74.6192 23.983 74.6465 25.1929C74.614 26.4133 74.8317 27.6274 75.2859 28.759C75.7401 29.8905 76.4211 30.9153 77.2861 31.7691Z"/>
						<path d="M100.989 38.285V0.547363H105.493V38.285H100.989Z"/>
						<path d="M109.259 38.285V12.4373H113.763V38.285H109.259Z"/>
						<path d="M138.461 2.09814H142.96V38.285H138.461V33.8367C136.217 37.251 132.963 38.9582 128.701 38.9582C126.969 38.9838 125.251 38.6454 123.656 37.9644C122.061 37.2835 120.624 36.2749 119.436 35.0029C118.192 33.7399 117.213 32.2378 116.556 30.5856C115.899 28.9335 115.577 27.165 115.611 25.3851C115.577 23.6053 115.899 21.8368 116.556 20.1846C117.213 18.5325 118.192 17.0303 119.436 15.7674C120.621 14.4884 122.056 13.4721 123.651 12.7829C125.246 12.0937 126.966 11.7467 128.701 11.764C132.979 11.764 136.241 13.4711 138.485 16.8854L138.461 2.09814ZM129.249 34.6122C130.463 34.6399 131.67 34.4199 132.797 33.9653C133.924 33.5108 134.949 32.8311 135.809 31.967C136.67 31.103 137.348 30.0724 137.804 28.9372C138.259 27.802 138.483 26.5856 138.461 25.3611C138.461 22.9028 137.493 20.5451 135.77 18.8068C134.047 17.0685 131.71 16.092 129.273 16.092C126.836 16.092 124.499 17.0685 122.776 18.8068C121.053 20.5451 120.085 22.9028 120.085 25.3611C120.064 26.5815 120.286 27.7938 120.738 28.9258C121.191 30.0577 121.865 31.086 122.721 31.9494C123.576 32.8128 124.595 33.4935 125.716 33.951C126.838 34.4085 128.04 34.6334 129.249 34.6122Z"/>
						<path d="M149.585 27.4291C149.928 29.5639 151.066 31.4861 152.767 32.803C154.559 34.1202 156.736 34.7952 158.952 34.7205C162.372 34.7205 164.857 33.4622 166.406 30.9456L170.237 33.1156C167.719 37.0108 163.923 38.9584 158.85 38.9584C154.743 38.9584 151.404 37.674 148.834 35.1052C147.563 33.8353 146.564 32.3147 145.901 30.6382C145.238 28.9618 144.924 27.1654 144.979 25.3613C144.926 23.5678 145.234 21.782 145.883 20.1116C146.532 18.4411 147.51 16.9205 148.757 15.6413C151.275 13.0565 154.537 11.7641 158.541 11.7641C160.285 11.7076 162.021 12.0373 163.626 12.73C165.231 13.4226 166.666 14.4615 167.83 15.7735C169.215 17.3433 170.241 19.2009 170.836 21.215C171.431 23.229 171.581 25.3504 171.274 27.4291H149.585ZM158.523 16.008C156.347 15.9289 154.218 16.6535 152.535 18.0457C150.93 19.4435 149.882 21.3804 149.585 23.4978H166.864C166.489 21.0513 165.518 19.1939 163.969 17.9195C162.442 16.6514 160.518 15.9718 158.541 16.002L158.523 16.008Z"/>
						<path d="M118.901 1.50623L113.847 7.00024L112.786 9.41374L110.028 6.20159L118.901 1.50623Z" fill="#2876AC"/>
						<path d="M118.91 1.50623L110.037 6.21036H106L118.91 1.50623Z" fill="#1E94E6"/>
						<path d="M118.91 1.49756L116.639 9.30853L113.847 6.99157L118.91 1.49756Z" fill="#1E94E6"/>
						<path d="M174.628 37.8944C175.698 37.8944 176.565 37.0197 176.565 35.9408C176.565 34.8618 175.698 33.9872 174.628 33.9872C173.559 33.9872 172.692 34.8618 172.692 35.9408C172.692 37.0197 173.559 37.8944 174.628 37.8944Z"/>
					</svg>

					<span class="label">Siteglide development tools</span>
				</a>
				<span class="instance" class:offline={!$state.online}>
				{#if $state.online === undefined}
					connecting…
				{:else if $state.online === false}
					disconnected
				{:else}
					<a href={$state.online?.MPKIT_URL}>
						{$state.online?.MPKIT_URL.replace('https://', '')}
					</a>
				{/if}
			</h1>
		</div>

		<nav>
			<ul>
				{#if $state.header.includes('database')}
				<li>
					<a href="/database" class:active={$page.url.pathname.startsWith('/database')} on:focus|once={preloadTables} on:mouseover|once={preloadTables}>
						<Icon icon="database" />
						<span class="label">
							Database
						</span>
					</a>
				</li>
				{/if}

				{#if $state.header.includes('users')}
				<li>
					<a href="/users" class:active={$page.url.pathname.startsWith('/users')}>
						<Icon icon="users" />
						<span class="label">
							Users
						</span>
					</a>
				</li>
				{/if}

				{#if $state.header.includes('logs')}
				<li>
					<a href="/logs" class:active={$page.url.pathname === '/logs'}>
						<Icon icon="log" />
						<span class="label">
							Logs
						</span>
					</a>
				</li>
				{/if}

				{#if $state.header.includes('backgroundJobs')}
				<li>
					<a href="/backgroundJobs" class:active={$page.url.pathname.startsWith('/backgroundJobs')}>
						<Icon icon="backgroundJob" />
						<span class="label">
							Background Jobs
						</span>
					</a>
				</li>
				{/if}

				{#if $state.header.includes('constants')}
				<li>
					<a href="/constants" class:active={$page.url.pathname.startsWith('/constants')}>
						<Icon icon="constant" />
						<span class="label">
							Constants
						</span>
					</a>
				</li>
				{/if}

				{#if $state.header.includes('liquid')}
				{@const url = (typeof window !== 'undefined' && window.location.port !== '4173' && window.location.port !== '5173') ? `http://localhost:${parseInt(window.location.port)}` : 'http://localhost:3333'}
				<li>
					<a href="{url}/gui/liquid">
						<Icon icon="liquid" />
						<span class="label">
							Liquid Evaluator
						</span>
					</a>
				</li>
				{/if}

				{#if $state.header.includes('graphiql')}
				{@const url = (typeof window !== 'undefined' && window.location.port !== '4173' && window.location.port !== '5173') ? `http://localhost:${parseInt(window.location.port)}` : 'http://localhost:3333'}
				<li>
					<a href="{url}/gui/graphql">
						<Icon icon="graphql" />
						<span class="label">
							GraphiQL
						</span>
					</a>
				</li>
				{/if}

			</ul>
		</nav>

	</div>
</header>
