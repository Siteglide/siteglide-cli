<!-- ================================================================== -->
<style>

.caution {
  margin: var(--space-page);
  margin-block-end: 0;
  padding: .85rem 1rem;

  border: 1px solid rgba(var(--color-rgb-danger), .35);
  border-radius: .5rem;
  background-color: var(--color-highlight);

  font-size: .9rem;
  line-height: 1.45;
  color: var(--color-text);

  max-height: 75px;
}

.caution strong {
  display: block;
  margin-block-end: .25rem;

  font-weight: 600;
}

</style>



<!-- ================================================================== -->
<aside class="caution" role="note">
  <strong>Use with caution</strong>
  This view allows direct changing of database records via the GraphQL layer, which can be useful for projects with custom platformOS features. It may allow changes which are not 100% compatible with the Siteglide Admin, so we recommend using with caution.
</aside>
