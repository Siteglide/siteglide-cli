<!-- ================================================================== -->
<script>

// imports
// ------------------------------------------------------------------------
import { fade } from 'svelte/transition';
import { state } from '$lib/state';
import { table } from '$lib/api/table';

import Icon from '$lib/ui/Icon.svelte';



// properties
// ------------------------------------------------------------------------
// which applications to show the description for (array or strings)
let showDescriptionFor = [];


// purpose:		preload tables data into the state store for faster navigation
// returns:		loads the tables into the $state.tables (array)
// ------------------------------------------------------------------------
const preloadTables = async () => {
  if(!$state.tables.length){
    $state.tables = await table.get();
  }
};


// purpose:   toggles pinned items in the header
// arguments: name of the navigation item to pin (string)
// ------------------------------------------------------------------------
const pin = what => {
  if($state.header.indexOf(what) > -1){
    $state.header = $state.header.filter(item => item !== what);
  } else {
    $state.header = [...$state.header, what];
  }

  localStorage.header = JSON.stringify($state.header);
};


// purpose:   toggles description for given application
// arguments: name of the application to toggle description for
// ------------------------------------------------------------------------
const toggleDescription = what => {
  if(showDescriptionFor.indexOf(what) > -1){
    showDescriptionFor = showDescriptionFor.filter(item => item !== what);
  } else {
    showDescriptionFor = [...showDescriptionFor, what];
  }
};


// purpose:   checks what is the latest pos-cli version in npm registry
// ------------------------------------------------------------------------
const getLatestCliVersion = async () => {
  const response = await fetch('https://registry.npmjs.org/@siteglide/siteglide-cli/latest');
  const data = await response.json();
  return data;
};


// purpose:   handles the action after clicking the 'update available' button
// effect:    copies update command to clipboard and shows a notification
// ------------------------------------------------------------------------
const handleUpdate = () => {
  navigator.clipboard.writeText(`npm i -g @siteglide/siteglide-cli@latest`)
    .then(() => {
      state.notification.create('info', `<div>Update command copied to clipboard <small>Run <code>npm i -g @siteglide/siteglide-cli@latest</code> in the terminal</small></div>`);
    })
    .catch(e => {
      copying = false;
      error = true;
      console.error(e);
    });
};

</script>


<!-- ================================================================== -->
<style>

nav {
  width: 100%;
  margin-inline: auto;
  margin-block-start: 2rem;
  padding-inline: 2rem;
}


.applications {
  display: flex;
  gap: 2rem;
  flex-wrap: wrap;
  justify-content: center;
}

  .applications + .applications {
    margin-top: 4rem;
  }


.application {
  width: 200px;
  position: relative;
  display: flex;
  overflow: hidden;

  border-radius: 1rem;
  background-color: var(--color-background);

  transition: width .2s ease-in-out;
}

  .application > a {
    width: 200px;
    padding: 2.75rem 1rem 2rem;
    display: flex;
    flex-shrink: 0;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .application.showDescription {
    width: 500px;
  }

.icon {
  width: 100px;
  height: 100px;
  padding: .5rem;
  display: flex;
  align-items: center;
  justify-content: center;

  border-radius: .5rem;
  background-color: var(--color-middleground);

  color: var(--color-interaction);

  transition: all .2s ease-in-out;
}

  .application > a:hover .icon {
    border-radius: 1rem;

    scale: 1.1;
  }

h2 {
  text-align: center;
  font-size: 1.1rem;
  font-weight: 500;
}

.description {
  width: 284px;
  padding: 2.75rem 1rem 2rem 0;
  flex-shrink: 0;
}

  .description li {
    margin-inline-start: 1ch;
    padding-inline-start: .4em;

    list-style-type: '–';
  }

  .description li + li {
    margin-block-start: .2em;
  }

.actions {
  display: flex;
  align-items: center;
  position: absolute;
  inset-inline-end: 0rem;
  inset-block-start: 0rem;
  overflow: hidden;

  opacity: 0;

  border: 1px solid var(--color-page);
  border-width: 0 0 1px 1px;
  border-radius: 0 1rem 0 1rem;

  transition: opacity .2s linear;
  transition-delay: 0s;
}

  .application:hover .actions {
    opacity: 1;
    transition-delay: .5s;
  }

  .actions li + li {
    border-inline-start: 1px solid var(--color-page);
  }

  .actions button {
    padding: .25em .5em;

    color: var(--color-text-secondary);

    transition: color .1s linear;
  }

  .actions button:hover,
  .actions button:focus-visible {
    color: var(--color-interaction-hover);
  }

footer {
  margin-block-start: 4rem;
  padding: 2rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2rem;

  border-block-start: 1px solid var(--color-frame);
}

footer ul {
  display: flex;
  gap: 2rem;
}

.update {
  max-width: 100px;
  display: flex;
  align-items: center;
  gap: .5em;

  font-size: .85rem;
}

.update :global(svg) {
  flex-shrink: 0;
}

</style>



<!-- ================================================================== -->
<svelte:head>
  <title>Siteglide{$state.online?.MPKIT_URL ? ': ' + $state.online.MPKIT_URL.replace('https://', '') : ''}</title>
</svelte:head>

<nav>

  <ul class="applications">


    <li class="application" class:showDescription={showDescriptionFor.includes('database')}>
      <a href="/database" on:focus|once={preloadTables} on:mouseover|once={preloadTables}>
        <div class="icon">
          <Icon icon="database" size="48" />
        </div>
        <h2>
          Database
        </h2>
      </a>
      <ul class="description">
        <li>Inspect tables and records</li>
        <li>Create, edit or delete records</li>
        <li>Filter and find any record</li>
      </ul>
      <ul class="actions">
        <li>
          <button title="More information" on:click={() => toggleDescription('database')}>
            <Icon icon="info" size="14" />
            <span class="label">Show more information about Database tool</span>
          </button>
        </li>
        <li>
          <button title="{$state.header.includes('database') ? 'Unpin Database from' : 'Pin Database to'} header menu" on:click={() => pin('database')}>
            <Icon icon={$state.header.includes('database') ? 'pinFilled' : 'pin'} size="14" />
            <span class="label">{$state.header.includes('database') ? 'Unpin Database from' : 'Pin Database to'} header menu</span>
          </button>
        </li>
      </ul>
    </li>

    <li class="application" class:showDescription={showDescriptionFor.includes('users')}>
      <a href="/users">
        <div class="icon">
          <Icon icon="users" size="48" />
        </div>
        <h2>
          Users
        </h2>
      </a>
      <ul class="description">
        <li>Inspect registered users and their personal data</li>
      </ul>
      <ul class="actions">
        <li>
          <button title="More information" on:click={() => toggleDescription('users')}>
            <Icon icon="info" size="14" />
            <span class="label">Show more information about Users tool</span>
          </button>
        </li>
        <li>
          <button title="{$state.header.includes('users') ? 'Unpin Users from' : 'Pin Users to'} header menu" on:click={() => pin('users')}>
            <Icon icon={$state.header.includes('users') ? 'pinFilled' : 'pin'} size="14" />
            <span class="label">{$state.header.includes('users') ? 'Unpin Users from' : 'Pin Users to'} header menu</span>
          </button>
        </li>
      </ul>
    </li>

    <li class="application" class:showDescription={showDescriptionFor.includes('logs')}>
      <a href="/logs">
        <div class="icon">
          <Icon icon="log" size="48" />
        </div>
        <h2>
          Logs
        </h2>
      </a>
      <ul class="description">
        <li>View system logs</li>
        <li>Inspect logs you've outputted yourself</li>
        <li>Debug Liquid or GraphQL errors</li>
      </ul>
      <ul class="actions">
        <li>
          <button title="More information" on:click={() => toggleDescription('logs')}>
            <Icon icon="info" size="14" />
            <span class="label">Show more information about Logs tool</span>
          </button>
        </li>
        <li>
          <button title="{$state.header.includes('logs') ? 'Unpin Logs from' : 'Pin Logs to'} header menu" on:click={() => pin('logs')}>
            <Icon icon={$state.header.includes('logs') ? 'pinFilled' : 'pin'} size="14" />
            <span class="label">{$state.header.includes('logs') ? 'Unpin Logs from' : 'Pin Logs to'} header menu</span>
          </button>
        </li>
      </ul>
    </li>

    <li class="application" class:showDescription={showDescriptionFor.includes('backgroundJobs')}>
      <a href="/backgroundJobs">
        <div class="icon">
          <Icon icon="backgroundJob" size="48" />
        </div>
        <h2>
          Background Jobs
        </h2>
      </a>
      <ul class="description">
        <li>List scheduled background jobs</li>
        <li>Debug background jobs that failed to run</li>
      </ul>
      <ul class="actions">
        <li>
          <button title="More information" on:click={() => toggleDescription('backgroundJobs')}>
            <Icon icon="info" size="14" />
            <span class="label">Show more information about Background Jobs tool</span>
          </button>
        </li>
        <li>
          <button title="{$state.header.includes('backgroundJobs') ? 'Unpin Background Jobs from' : 'Pin Background Jobs to'} header menu" on:click={() => pin('backgroundJobs')}>
            <Icon icon={$state.header.includes('backgroundJobs') ? 'pinFilled' : 'pin'} size="14" />
            <span class="label">{$state.header.includes('backgroundJobs') ? 'Unpin Background Jobs from' : 'Pin Background Jobs to'} header menu</span>
          </button>
        </li>
      </ul>
    </li>

    <li class="application" class:showDescription={showDescriptionFor.includes('constants')}>
      <a href="/constants">
        <div class="icon">
          <Icon icon="constant" size="48" />
        </div>
        <h2>
          Constants
        </h2>
      </a>
      <ul class="description">
        <li>Check all constants in one place</li>
        <li>Create new constants</li>
        <li>Edit or delete existing ones</li>
      </ul>
      <ul class="actions">
        <li>
          <button title="More information" on:click={() => toggleDescription('constants')}>
            <Icon icon="info" size="14" />
            <span class="label">Show more information about Constants tool</span>
          </button>
        </li>
        <li>
          <button title="{$state.header.includes('constants') ? 'Unpin Constants from' : 'Pin Constants to'} header menu" on:click={() => pin('constants')}>
            <Icon icon={$state.header.includes('constants') ? 'pinFilled' : 'pin'} size="14" />
            <span class="label">{$state.header.includes('constants') ? 'Unpin Constants from' : 'Pin Constants to'} header menu</span>
          </button>
        </li>
      </ul>
    </li>

  </ul>

  <ul class="applications">

    <li class="application" class:showDescription={showDescriptionFor.includes('liquid')}>
      <a href="{(typeof window !== 'undefined' && window.location.port !== '4173' && window.location.port !== '5173') ? `http://localhost:${parseInt(window.location.port)}` : 'http://localhost:3333'}/gui/liquid">
        <div class="icon" style="color: #aeb0b3;">
          <Icon icon="liquid" size="48" />
        </div>
        <h2>
          Liquid Evaluator
        </h2>
      </a>
      <ul class="description">
        <li>Run Liquid code against your instance</li>
        <li>Test Liquid logic</li>
        <li>Quickly prototype your ideas</li>
      </ul>
      <ul class="actions">
        <li>
          <button title="More information" on:click={() => toggleDescription('liquid')}>
            <Icon icon="info" size="14" />
            <span class="label">Show more information about Liquid Evaluator</span>
          </button>
        </li>
        <li>
          <button title="{$state.header.includes('liquid') ? 'Unpin Liquid Evaluator from' : 'Pin Liquid Evaluator to'} header menu" on:click={() => pin('liquid')}>
            <Icon icon={$state.header.includes('liquid') ? 'pinFilled' : 'pin'} size="14" />
            <span class="label">{$state.header.includes('liquid') ? 'Unpin Liquid Evaluator from' : 'Pin Liquid Evaluator to'} header menu</span>
          </button>
        </li>
      </ul>
    </li>

    <li class="application" class:showDescription={showDescriptionFor.includes('graphiql')}>
      <a href="{(typeof window !== 'undefined' && window.location.port !== '4173' && window.location.port !== '5173') ? `http://localhost:${parseInt(window.location.port)}` : 'http://localhost:3333'}/gui/graphql">
        <div class="icon" style="color: #f30e9c;">
          <Icon icon="graphql" size="48" />
        </div>
        <h2>
          GraphiQL
        </h2>
      </a>
      <ul class="description">
        <li>Run GraphQL against your instance</li>
        <li>Explore documentation</li>
        <li>Quickly prototype your queries and mutations</li>
      </ul>
      <ul class="actions">
        <li>
          <button title="More information" on:click={() => toggleDescription('graphiql')}>
            <Icon icon="info" size="14" />
            <span class="label">Show more information about GraphiQL</span>
          </button>
        </li>
        <li>
          <button title="{$state.header.includes('graphiql') ? 'Unpin GraphiQL from' : 'Pin GraphiQL to'} header menu" on:click={() => pin('graphiql')}>
            <Icon icon={$state.header.includes('graphiql') ? 'pinFilled' : 'pin'} size="14" />
            <span class="label">{$state.header.includes('graphiql') ? 'Unpin GraphiQL from' : 'Pin GraphiQL to'} header menu</span>
          </button>
        </li>
      </ul>
    </li>

  </ul>

</nav>

<footer>
  <div>
    {#await getLatestCliVersion() then latest}
      {#if latest.version !== $state.online.version}
        <button transition:fade on:click={handleUpdate} title="Update to siteglide-cli version {latest.version}" class="update">
          <Icon icon="arrowTripleUp" />
          <span>Update available</span>
        </button>
      {/if}
    {/await}
  </div>

  <ul>
    <li>
      <a href="https://developers.siteglide.com" class="button">
        <Icon icon="book" />
        Documentation
      </a>
    </li>
    <li>
      <a href="https://my.siteglide.com" class="button">
        <Icon icon="serverSettings" />
        Siteglide Portal
      </a>
    </li>
  </ul>
</footer>