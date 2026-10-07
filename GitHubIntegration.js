var GitHubIntegration = Class.create();
GitHubIntegration.prototype = Object.extendsObject(global.AbstractAjaxProcessor, {

    API: 'https://api.github.com',

    commitFile: function() {
        try {
            if (!gs.hasRole('admin'))
                return this._result(false, 'Only admins can push code to GitHub.');

            var table = this.getParameter('sysparm_table');
            var sysId = this.getParameter('sysparm_sys_id');
            var action = this.getParameter('sysparm_action');
            var repo = (this.getParameter('sysparm_repo') || '').trim();
            var path = (this.getParameter('sysparm_file') || '').trim();
            var message = this.getParameter('sysparm_message') || 'Commit from ServiceNow';

            if (!repo || !path)
                return this._result(false, 'Repository name and file name are required.');

            var gr = new GlideRecord(table);
            if (!gr.get(sysId))
                return this._result(false, 'Record not found.');
            var code = gr.getValue('script');
            if (!code)
                return this._result(false, 'This record has no script field content.');

            var owner = gs.getProperty('github.owner');

            if (action === 'new') {
                var created = this._createRepo(repo);
                if (created.status !== 201 && created.status !== 422)
                    return this._result(false, 'Could not create repo (HTTP ' + created.status + '): ' + created.body);
            }

            var sha = this._getSha(owner, repo, path);

            var payload = {
                message: message,
                content: GlideStringUtil.base64Encode(code)
            };
            if (sha) payload.sha = sha;

            var put = this._request('PUT', this._contentsUrl(owner, repo, path), payload);
            if (put.status === 200 || put.status === 201) {
                var verb = (put.status === 201) ? 'created' : 'updated';
                return this._result(true, 'File ' + verb + ': https://github.com/' + owner + '/' + repo + '/blob/HEAD/' + path);
            }
            return this._result(false, 'GitHub returned HTTP ' + put.status + ': ' + put.body);

        } catch (e) {
            gs.error('GitHubIntegration.commitFile: ' + e);
            return this._result(false, 'Unexpected error: ' + e);
        }
    },

    _createRepo: function(name) {
        return this._request('POST', this.API + '/user/repos', {
            name: name,
            description: 'Created from ServiceNow',
            'private': false,
            auto_init: true
        });
    },

    _getSha: function(owner, repo, path) {
        var res = this._request('GET', this._contentsUrl(owner, repo, path));
        if (res.status === 200)
            return JSON.parse(res.body).sha;
        return null;
    },

    _contentsUrl: function(owner, repo, path) {
        var safePath = path.split('/').map(encodeURIComponent).join('/');
        return this.API + '/repos/' + owner + '/' + repo + '/contents/' + safePath;
    },

    _request: function(method, url, bodyObj) {
        var token = gs.getProperty('github.token');

        var rm = new sn_ws.RESTMessageV2();
        rm.setEndpoint(url);
        rm.setHttpMethod(method);
        rm.setRequestHeader('Authorization', 'Bearer ' + token);
        rm.setRequestHeader('Accept', 'application/vnd.github+json');
        rm.setRequestHeader('X-GitHub-Api-Version', '2022-11-28');
        rm.setRequestHeader('User-Agent', 'ServiceNow-GitHub-Integration');
        if (bodyObj) {
            rm.setRequestHeader('Content-Type', 'application/json');
            rm.setRequestBody(JSON.stringify(bodyObj));
        }
        var resp = rm.execute();
        return {
            status: resp.getStatusCode(),
            body: resp.getBody()
        };
    },

    _result: function(ok, msg) {
        return JSON.stringify({
            success: ok,
            message: msg
        });
    },

    type: 'GitHubIntegration'
});