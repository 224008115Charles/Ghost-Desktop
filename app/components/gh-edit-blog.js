import Ember from 'ember';
import getIsGhost from '../utils/get-is-ghost';
import getBlogName from '../utils/get-blog-name';
import {sanitizeUrl, isValidUrl} from '../utils/sanitize-url';
import Phrases from '../utils/phrases';

const {Component, inject, computed, run} = Ember;

export default Component.extend({
    store: inject.service(),
    classNames: ['gh-edit-blog'],
    classNameBindings: ['isBasicAuth:basic-auth', 'hasWarning'],
    isBasicAuth: false,
    hasWarning: computed.bool('editWarning'),

    /**
     * A boolean value that is true if any errors are present
     */
    hasError: computed('isIdentificationInvalid', 'isUrlInvalid', 'isPasswordInvalid', {
        get() {
            const identification = this.get('isIdentificationInvalid');
            const url = this.get('isUrlInvalid');
            const password = this.get('isPasswordInvalid');
            return (identification || url || password);
        }
    }),

    /**
     * If we received a blog, setup the properties on this baby
     */
    didReceiveAttrs() {
        if (this.get('blog')) {
            const blog = this.get('blog');
            const isBasicAuth = (blog.get('basicUsername') || blog.get('basicPassword'));

            this.setProperties({
                url: blog.get('url'),
                identification: blog.get('identification'),
                password: blog.getPassword(),
                basicUsername: blog.get('basicUsername'),
                basicPassword: blog.get('basicPassword'),
                isBasicAuth
            });
        } else if (this.get('preFillValues')) {
            const preFillValues = this.get('preFillValues');

            this.setProperties({
                url: preFillValues.url || '',
                identification: preFillValues.identification || '',
                password: preFillValues.password || '',
                basicUsername: preFillValues.basicUsername || '',
                basicPassword: preFillValues.basicPassword || ''
            });
        }
    },

    /**
     * Validates that the passed url is actually a Ghost login page,
     * displaying errors if it isn't.
     *
     * @param url - Url to check
     * @param basicAuth - Auth object
     * @returns {Promise}
     */
    _validateUrlIsGhost(url = '', basicAuth) {
        return getIsGhost(url, basicAuth)
            .then((is) => {
                this.set('isUrlInvalid', !is);

                if (!is) {
                    this.set('urlError', Phrases.urlNotGhost);
                }

                return is;
            })
            .catch((err) => {
                // Handle 401
                if (err && err.status === 401) {
                    this.set('isBasicAuth', true);
                } else {
                    // We failed to reach the page, mark it as invalid
                    this.set('isUrlInvalid', true);
                    this.set('urlError', Phrases.urlNotReachable);
                }
            });
    },

    /**
     * Attempts to find DS record for a given url,
     * return null if nothing is found.
     *
     * @param {string} [url='']
     * @returns {Promise}
     */
    _ensureSingleRecord(url = '') {
        return new Promise((resolve) => {
            this.get('store')
                .findAll('blog')
                .then((blogs) => {
                    if (!blogs || !blogs.content || blogs.length === 0) {
                        // Nothing found? That's cool, too
                        resolve(null);
                    }

                    // Resolve with the first blog that has the same url,
                    // or undefined
                    resolve(blogs.find((b) => (b.get('url') === url)));
                })
                .catch(() => resolve(null));
        });
    },

    /**
     * Creates a blog record, if it doesn't already exists
     *
     * @param {string} [url=''] Url
     * @param {string} [name=''] Name
     * @param {string} [identification=''] Identification
     * @param {string} [basicUsername=''] HTTP Basic Auth Username
     * @param {string} [basicPassword=''] HTTP Basic Auth Password
     * @returns {Promise} - Resolves with a blog record
     */
    _createBlogIfNotExists(url = '', name = '', identification = '', basicUsername = '', basicPassword = '') {
        return new Promise(async (resolve) => {
            let record = this.get('blog') || await this._ensureSingleRecord(url);

            if (!record) {
                // If the blog doesn't already exist, create it
                record = this.get('store').createRecord('blog', {url});
            } else {
                // If it does exist, ensure that everybody knows this is super new
                // This ensures we update even if only the password field was updated
                record.set('isResetRequested', true);
            }

            record.setProperties({
                url,
                name,
                identification,
                basicUsername,
                basicPassword
            });

            // Set the password in an extra step, because it's a native call
            record.setPassword(this.get('password'));
            record.save().then((savedBlog) => resolve(savedBlog));
        });
    },

    actions: {
        /**
         * Add's a blog, using the input given by the user
         */
        async addOrEditBlog() {
            // Manually begin a run loop, since async/await is still
            // black magic as far as Ember is concerned
            run.begin();
            this.set('isSubmitting', true);

            const url = sanitizeUrl(this.get('url'));
            const identification = this.get('identification');
            const basicUsername = this.get('basicUsername');
            const basicPassword = this.get('basicPassword');
            const isUrlGhost = await this._validateUrlIsGhost(url, {basicUsername, basicPassword});

            if (isUrlGhost) {
                const name = await getBlogName(url);

                this._createBlogIfNotExists(url, name, identification, basicUsername, basicPassword)
                    .then((record) => this.sendAction('blogAdded', record));
            }

            this.set('isSubmitting', false);
            run.end();
        },

        /**
         * Validates the identification entered by the user. It should be an email.
         */
        validateIdentification(input) {
            const identificationPattern = /[^@]+@[^@]+\.[^@]+/gi;
            const invalid = !identificationPattern.test(input);

            this.set('identificationError', invalid ? Phrases.identificationInvalid : null);
            this.set('isIdentificationInvalid', invalid);
        },

        /**
         * Validates the url given by the user. It should be a properly formatted url.
         */
        validateUrl(input) {
            const invalid = !isValidUrl(sanitizeUrl(input));

            this.set('isUrlInvalid', invalid);
            this.set('urlError', invalid ? Phrases.urlInvalid : undefined);
        },

        /**
         * Validates the password given by the user. It should not be empty.
         */
        validatePassword(input) {
            this.set('isPasswordInvalid', (!input || input.length < 1));
        }
    }
});
