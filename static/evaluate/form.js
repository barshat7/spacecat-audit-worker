const evalFn = () => {
    /* eslint-disable no-undef */
    const { document } = window;
    const forms = document.querySelectorAll('form');
    const isElementXPercentInViewport = function (el, percentVisible) {
        let
            rect = el.getBoundingClientRect(),
            windowHeight = (window.innerHeight || document.documentElement.clientHeight);

        return !(
            Math.floor(100 - (((rect.top >= 0 ? 0 : rect.top) / +-rect.height) * 100)) < percentVisible ||
            Math.floor(100 - ((rect.bottom - windowHeight) / rect.height) * 100) < percentVisible
        )
    };

    const getFormType = function (el) {
        if (!el || el.tagName !== 'FORM') return undefined;
        // if the form has a search role or a search field, it's a search form
        if (el.getAttribute('role') === 'search'
          || el.querySelector('input[type="search"]')
          || el.querySelectorAll('input').filter((e) => e.getAttribute('role') === 'searchbox').length > 0
          || el.action?.endsWith('search.html')
        ) return 'search';
        const password = el.querySelectorAll('input[type="password"]');
        // if the form has one password input, it's a login form
        if (password.length === 1) return 'login';
        // if the form has more than one password input, it's a signup form
        if (password.length > 1) return 'signup';
        return el.getAttribute('id');
    };

    const getFieldLabel = function (field) {
        // Try associated label via 'for' attribute
        const labelElement = document.querySelector(`label[for="${field.id}"]`);
        if (labelElement) return labelElement.textContent.trim();

        // Check for parent label
        const parentLabel = field.closest('label');
        if (parentLabel) return parentLabel.textContent.trim();

        // Try placeholder
        if (field.placeholder) return field.placeholder.trim();

        // Try innerText
        if (field.innerText) return field.innerText.trim();

        // Fallback to attributes
        return field.name || field.id || field.className || '';
    };

    return Array.from(forms).map(form => {
        const formType = getFormType(form);
        const formFields = form.querySelectorAll('input:not([type="hidden"]), select, textarea, button');
        const formFieldsLabels = [];
        let visibleFieldCount = 0;
        let visibleInViewPortFieldCount = 0;
        for (let i = 0; i < formFields.length; i++) {
            const isVisible = formFields[i].checkVisibility();
            const isVisibleInViewPort = isVisible && isElementXPercentInViewport(formFields[i], 90);
            if (isVisible) {
                visibleFieldCount++;
            }
            if (isVisibleInViewPort) {
                visibleInViewPortFieldCount++;
            }
            const fieldLabel = getFieldLabel(formFields[i]);
            if(fieldLabel) {formFieldsLabels.push(fieldLabel);}
        }
        return {
            id: form.id,
            formType,
            classList: form.classList.toString(),
            visibleATF: isElementXPercentInViewport(form, 20),
            fieldCount: formFields.length,
            visibleFieldCount: visibleFieldCount,
            fieldsLabels: formFieldsLabels,
            visibleInViewPortFieldCount: visibleInViewPortFieldCount
        }
    });
};
evalFn();
