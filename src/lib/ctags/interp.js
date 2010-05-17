/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an 'AS IS' basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Bespin.
 *
 * The Initial Developer of the Original Code is
 * Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Bespin Team (bespin@mozilla.com)
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

// Abstract interpreter, based on Narcissus.

var jsdefs = require('narcissus/jsdefs');
var jsparse = require('narcissus/jsparse');
var tokenIds = jsdefs.tokenIds, tokens = jsdefs.tokens;
var Trait = require('traits').Trait;

var puts = require('sys').puts;

exports.Interpreter = Trait({
    _addDefs: function(defs, baseTag) {
        for (var name in defs) {
            var def = defs[name];
            if (def.hidden || !('node' in def)) {
                continue;
            }

            var tag = {};
            for (var tagfield in baseTag) {
                tag[tagfield] = baseTag[tagfield];
            }

            tag.name = name;

            var node = def.node;
            tag.tagfile = node.filename;
            tag.addr = node.lineno; // TODO: regex instead

            this.tags.push(tag);
        }
    },

    _exec: function(node, ctx) {
        var self = this;
        var doExec = function(node) { return self._exec(node, ctx); };

        switch (node.type) {
        case tokenIds.FUNCTION:
            if (node.functionForm === jsparse.EXPRESSED_FORM) {
                return;
            }

            var isStatement = node.functionForm === jsparse.STATEMENT_FORM;
            if (node.name !== null && node.name !== undefined && !isStatement) {
                // Introduce a new scope.
                ctx.scope = { object: {}, parent: ctx.scope };
            }

            var fn = { type: 'function', node: node, value: ctx.scope };

            if (isStatement) {
                ctx.scope.object[node.name] = fn;
            }

            return fn;

        case tokenIds.SCRIPT:
            node.funDecls.forEach(function(decl) {
                ctx.scope.object[decl.name] = { node: decl, value: ctx.scope };
            });
            node.varDecls.forEach(function(decl) {
                ctx.scope.object[decl.name] = { node: decl, value: decl };
            });

            // FALL THROUGH
        case tokenIds.BLOCK:
            node.forEach(doExec);
            break;

        case tokenIds.SEMICOLON:
            if (node.expression !== null && node.expression !== undefined) {
                return doExec(node.expression);
            }
            break;

        case tokenIds.LIST:
            var args = { node: node };
            args.value = node.map(doExec);
            args.value.length = node.length;
            return args;

        case tokenIds.CALL:
            var lhs = doExec(node[0]);
            var rhs = doExec(node[1]);
            // TODO: valueOf to dereference stuff
            if (typeof(lhs) !== 'object' || lhs.type !== 'function') {
                puts("not a function");
                return;
            }

            var thisObject = (lhs.type === 'reference')
            puts("call TODO"); // TODO
            break;

        case tokenIds.IDENTIFIER:
            var scope = ctx.scope;
            while (scope !== null) {
                if (node.value in scope.object) {
                    break;
                }
            }

            var container = scope === null ? null : scope.object;
            return {
                type:       'reference',
                container:  container,
                name:       node.value,
                node:       node
            };

        case tokenIds.GROUP:
            return doExec(node[0]);

        default:
            puts("unknown token " + tokens[node.type] + " @ " + node.lineno);
        }
    },

    /** Takes a Narcissus AST and discovers the tags in it. */
    interpret: function(ast, module, opts) {
        var exportsDefs, windowDefs = {};

        var ctx = {
            scope: {
                parent: null,
                object: { window: { hidden: true, value: windowDefs } }
            }
        };

        if (opts.commonJS) {
            exportsDefs = {};
            ctx.scope.object.exports = { hidden: true, value: exportsDefs };
        }

        this._exec(ast, ctx, opts);

        this._addDefs(windowDefs, {});
        if (!opts.commonJS) {
            var scope = ctx.scope;
            while (scope !== null) {
                this._addDefs(scope.object, {});
                scope = scope.parent;
            }
        } else {
            this._addDefs(exportsDefs, { module: module });
        }
    }
});

