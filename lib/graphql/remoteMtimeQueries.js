/**
 * Path → platformOS admin GraphQL resource type, and prebuilt queries used by
 * remote mtime checks (file lookup + since-pull listing + newest-per-type).
 */

/** Grace window (ms) around deploy timestamps for clock skew / push lag. */
const DEPLOY_GRACE_MS = 120000;

/**
 * Map a unixified project-relative / API physical_file_path to a resource kind.
 * Returns null for unmapped paths (caller should skip the remote check).
 *
 * @param {string} physicalPath
 * @returns {{ kind: string, queryField: string } | null}
 */
function mapPathToResource(physicalPath) {
	const p = physicalPath.replace(/\\/g, '/').replace(/^\//, '');

	// modules/<name>/{public|private}/... → strip to the same rules under the module root
	let rel = p;
	const mod = p.match(/^modules\/[^/]+\/(public|private)\/(.+)$/);
	if (mod) {
		rel = mod[2];
	}

	if (rel.startsWith('views/pages/') || rel.includes('/views/pages/')) {
		return { kind: 'page', queryField: 'admin_pages' };
	}
	if (rel.startsWith('views/layouts/') || rel.includes('/views/layouts/')) {
		return { kind: 'layout', queryField: 'admin_liquid_layouts' };
	}
	if (
		rel.startsWith('views/partials/') ||
		rel.includes('/views/partials/') ||
		(rel.startsWith('views/') && rel.endsWith('.liquid'))
	) {
		return { kind: 'partial', queryField: 'admin_liquid_partials' };
	}
	if (rel.startsWith('assets/') || rel.includes('/assets/')) {
		return { kind: 'asset', queryField: 'admin_assets' };
	}
	if (rel.startsWith('graphql/') || rel.includes('/graphql/')) {
		return { kind: 'graphql', queryField: 'admin_graphql' };
	}
	if (rel.startsWith('authorization_policies/') || rel.includes('/authorization_policies/')) {
		return { kind: 'authorization_policy', queryField: 'admin_authorization_policies' };
	}
	if (
		rel.startsWith('form_configurations/') ||
		rel.includes('/form_configurations/') ||
		rel.startsWith('forms/')
	) {
		return { kind: 'form', queryField: 'admin_forms' };
	}
	if (rel.startsWith('schema/') || rel.includes('/schema/') || rel.includes('custom_model_types/')) {
		return { kind: 'schema', queryField: 'admin_model_schemas' };
	}
	if (
		rel.startsWith('notifications/') ||
		rel.includes('/notifications/') ||
		rel.startsWith('emails/')
	) {
		return { kind: 'email', queryField: 'admin_email_notifications' };
	}
	return null;
}

/**
 * Strip app/ or marketplace_builder/ prefix and normalize separators.
 * @param {string} filePath
 * @param {string | null} siteRoot
 * @returns {string}
 */
function toPhysicalApiPath(filePath, siteRoot) {
	let p = filePath.replace(/\\/g, '/');
	if (siteRoot) {
		p = p.replace(new RegExp(`^${siteRoot}/`), '');
	}
	p = p.replace(/^app\//, '').replace(/^marketplace_builder\//, '');
	return p;
}

/**
 * GraphQL query: fetch updated_at for one physical path on a given admin collection.
 * @param {string} queryField e.g. admin_pages
 * @param {string} physicalPath
 * @returns {string}
 */
function buildFileMtimeQuery(queryField, physicalPath) {
	const escaped = physicalPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
	// Pages expose `content`; most liquid resources use `body`.
	const bodyField = queryField === 'admin_pages' ? 'content' : 'body';
	const extra = queryField === 'admin_assets' ? '' : `\n\t\t\t\t\t${bodyField}`;
	return `
		query RemoteFileMtime {
			result: ${queryField}(
				per_page: 1
				filter: { physical_file_path: { exact: "${escaped}" } }
			) {
				items: results {
					physical_file_path
					updated_at${extra}
				}
			}
		}
	`;
}

/**
 * Resource kinds used for deploy pre/post drift scans.
 */
const DEPLOY_SCAN_FIELDS = [
	{ kind: 'page', queryField: 'admin_pages' },
	{ kind: 'layout', queryField: 'admin_liquid_layouts' },
	{ kind: 'partial', queryField: 'admin_liquid_partials' },
	{ kind: 'asset', queryField: 'admin_assets' },
	{ kind: 'graphql', queryField: 'admin_graphql' },
	{ kind: 'authorization_policy', queryField: 'admin_authorization_policies' },
	{ kind: 'form', queryField: 'admin_forms' },
	{ kind: 'email', queryField: 'admin_email_notifications' }
];

/**
 * Query one page of files with updated_at > sinceIso for a resource type.
 * @param {string} queryField
 * @param {string} sinceIso
 * @param {number} [page]
 * @param {number} [perPage]
 */
function buildUpdatedSinceQuery(queryField, sinceIso, page = 1, perPage = 50) {
	const escaped = sinceIso.replace(/"/g, '\\"');
	return `
		query RemoteUpdatedSince {
			result: ${queryField}(
				page: ${page}
				per_page: ${perPage}
				sort: [{ updated_at: { order: DESC } }]
				filter: { updated_at: { gt: "${escaped}" } }
			) {
				items: results {
					physical_file_path
					updated_at
				}
			}
		}
	`;
}

module.exports = {
	DEPLOY_GRACE_MS,
	DEPLOY_SCAN_FIELDS,
	mapPathToResource,
	toPhysicalApiPath,
	buildFileMtimeQuery,
	buildUpdatedSinceQuery
};
