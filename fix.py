import sys

def modify():
    try:
        with open('src/features/transfers.js', 'r', encoding='utf-8') as f:
            code = f.read()

        code = code.replace(
            '''    let selectEl = document.getElementById('main-stock-item');\n    selectEl.innerHTML = '';''',
            '''    let selectEl = document.getElementById('main-stock-item');\n    selectEl.innerHTML = '<option value=\"\" disabled selected>— Select a Product —</option>';'''
        )

        code = code.replace(
            '''    let selectEl = document.getElementById('return-stock-item');\n    selectEl.innerHTML = '';''',
            '''    let selectEl = document.getElementById('return-stock-item');\n    selectEl.innerHTML = '<option value=\"\" disabled selected>— Select a Product —</option>';'''
        )

        code = code.replace(
            '''    let itemSelect = document.getElementById('desk-transfer-item');\n    itemSelect.innerHTML = '';''',
            '''    let itemSelect = document.getElementById('desk-transfer-item');\n    itemSelect.innerHTML = '<option value=\"\" disabled selected>— Select a Product —</option>';'''
        )
        
        code = code.replace(
            '''targetSelect.innerHTML = optionsHTML || '<option value=\"\">No other desks open</option>';''',
            '''targetSelect.innerHTML = (optionsHTML ? '<option value=\"\" disabled selected>— Select an Agent —</option>' + optionsHTML : '<option value=\"\">No other desks open</option>');'''
        )

        code = code.replace(
            '''    let selectEl = document.getElementById('transfer-item-select');\n    selectEl.innerHTML = '';''',
            '''    let selectEl = document.getElementById('transfer-item-select');\n    selectEl.innerHTML = '<option value=\"\" disabled selected>— Select a Product —</option>';'''
        )

        code = code.replace(
            '''    let itemName = document.getElementById('main-stock-item').value;\n\n    const tx = {''',
            '''    let itemName = document.getElementById('main-stock-item').value;\n    if (!itemName) {\n        isSaving = false;\n        showAppAlert(\"Invalid Selection\", \"Please select a product.\");\n        return;\n    }\n\n    const tx = {'''
        )

        code = code.replace(
            '''    let itemName = document.getElementById('return-stock-item').value;\n\n    if (!passStockFirewall(itemName, qty)) {''',
            '''    let itemName = document.getElementById('return-stock-item').value;\n    if (!itemName) {\n        isSaving = false;\n        showAppAlert(\"Invalid Selection\", \"Please select a product.\");\n        return;\n    }\n\n    if (!passStockFirewall(itemName, qty)) {'''
        )

        code = code.replace(
            '''    let itemName = document.getElementById('desk-transfer-item').value;\n\n    let targetSelect = document.getElementById('desk-transfer-target');''',
            '''    let itemName = document.getElementById('desk-transfer-item').value;\n    if (!itemName) {\n        isSaving = false;\n        showAppAlert(\"Invalid Selection\", \"Please select a product.\");\n        return;\n    }\n\n    let targetSelect = document.getElementById('desk-transfer-target');'''
        )

        code = code.replace(
            '''    let itemName = document.getElementById('transfer-item-select').value;\n    let timeStr = new Date().toLocaleTimeString('en-GB', {hour: '2-digit', minute:'2-digit'});''',
            '''    let itemName = document.getElementById('transfer-item-select').value;\n    if (!itemName) {\n        showAppAlert(\"Invalid Selection\", \"Please select a product.\");\n        return;\n    }\n    let timeStr = new Date().toLocaleTimeString('en-GB', {hour: '2-digit', minute:'2-digit'});'''
        )

        code = code.replace(
            '''    const actionSelect = document.getElementById('mgr-cash-action');\n    if (actionSelect) {\n        actionSelect.value = 'drop_manager';\n        // Attach change listener if not already done''',
            '''    const actionSelect = document.getElementById('mgr-cash-action');\n    if (actionSelect) {\n        actionSelect.value = '';\n        // Attach change listener if not already done'''
        )
        
        code = code.replace(
            '''    let action = document.getElementById('mgr-cash-action').value; \n    let finalCash = 0;''',
            '''    let action = document.getElementById('mgr-cash-action').value; \n    if (!action) {\n        isSaving = false;\n        showAppAlert(\"Invalid Selection\", \"Please select an action.\");\n        return;\n    }\n    let finalCash = 0;'''
        )

        with open('src/features/transfers.js', 'w', encoding='utf-8') as f:
            f.write(code)
            
        print("Success")
    except Exception as e:
        print(f"Error: {e}")

modify()
