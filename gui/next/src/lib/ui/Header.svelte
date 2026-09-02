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
					<img class="logotype" src="https://files.uk-siteglide.com/instances/207/assets/sg/logo-white.png" />
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
