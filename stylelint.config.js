/** @type {import('stylelint').Config} */
module.exports = {
  extends: ["stylelint-config-standard"],
  ignoreFiles: [
    "node_modules/**/*",
    "android/**/*",
    "www/staff/staff.bk/**/*"
  ],
  rules: {
    "no-descending-specificity": null,
    "selector-class-pattern": null,
    "selector-id-pattern": null,
    "custom-property-empty-line-before": null,
    "declaration-empty-line-before": null,
    "media-feature-range-notation": null,
    "color-function-notation": null,
    "color-function-alias-notation": null,
    "alpha-value-notation": null,
    "color-hex-length": null,
    "font-family-name-quotes": null,
    "comment-empty-line-before": null,
    "property-no-vendor-prefix": null,
    "rule-empty-line-before": null,
    "keyframes-name-pattern": null,
    "value-keyword-case": null
  }
};
