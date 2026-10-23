/**
 * GraphQL queries for selective pull — full record fields per admin collection.
 */

const { mapPathToResource } = require('./remoteMtimeQueries');

/**
 * @param {string} queryField
 * @returns {string}
 */
function contentFieldsForQueryField(queryField) {
	switch (queryField) {
		case 'admin_pages':
			return `
					layout
					max_deep_level
					metadata
					redirect_code
					redirect_to
					redirect_url
					searchable
					format
					dynamic_cache_key
					dynamic_cache_layout
					dynamic_cache_expire
					static_cache_expire
					request_method
					slug
					content`;
		case 'admin_liquid_layouts':
		case 'admin_liquid_partials':
			return `
					metadata
					body`;
		case 'admin_assets':
			return `
					name
					url
					body`;
		case 'admin_graphql':
			return `
					body`;
		case 'admin_authorization_policies':
			return `
					body`;
		case 'admin_forms':
			return `
					authorization_policies
					fields
					name
					redirect_to
					resource
					resource_owner
					body`;
		case 'admin_email_notifications':
			return `
					from
					layout
					metadata
					name
					reply_to
					subject
					to
					trigger_condition
					unique_args
					body`;
		case 'admin_model_schemas':
			return `
					name
					properties
					body`;
		default:
			return `
					body`;
	}
}

/**
 * @param {string} physicalPath
 * @returns {string | null}
 */
function buildFileContentQuery(physicalPath) {
	const mapped = mapPathToResource(physicalPath);
	if (!mapped) {
		return null;
	}
	const escaped = physicalPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
	const fields = contentFieldsForQueryField(mapped.queryField);
	return `
		query RemoteFileContent {
			result: ${mapped.queryField}(
				per_page: 1
				filter: { physical_file_path: { exact: "${escaped}" } }
			) {
				items: results {
					physical_file_path
					updated_at${fields}
				}
			}
		}
	`;
}

module.exports = {
	buildFileContentQuery,
	contentFieldsForQueryField
};
