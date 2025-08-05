document.addEventListener('DOMContentLoaded', () => {
    // 获取DOM元素
    const searchTermInput = document.getElementById('searchTerm');
    const mappedTermInput = document.getElementById('mappedTerm');
    const searchColorInput = document.getElementById('searchColor');
    const mappedColorInput = document.getElementById('mappedColor');
    const addButton = document.getElementById('addMapping');
    const updateButton = document.getElementById('updateMapping');
    const cancelButton = document.getElementById('cancelEdit');
    const clearButton = document.getElementById('clearAll');
    const mappingList = document.getElementById('mappingList');
    const exportButton = document.getElementById('exportBtn');
    const importButton = document.getElementById('importBtn');
    const importFileInput = document.getElementById('importFile');
    const statusMessage = document.getElementById('statusMessage');
    
    // 存储映射关系
    let mappings = [];
    // 当前正在编辑的索引，-1表示未在编辑
    let editingIndex = -1;
    // 颜色变化防抖定时器
    let colorChangeTimeout;
    
    // 初始化
    init();
    
    async function init() {
        try {
            // 从本地存储加载数据
            await loadFromStorage();
            
            // 数据迁移：确保每组都有颜色设置
            mappings = mappings.map(mapping => {
                // 处理旧格式数据
                if (mapping.mappedTerm && !mapping.mappedTerms) {
                    mapping.mappedTerms = [mapping.mappedTerm];
                    delete mapping.mappedTerm;
                }
                
                // 添加默认颜色设置（如果没有）
                return {
                    searchTerms: mapping.searchTerms || [],
                    mappedTerms: mapping.mappedTerms || [],
                    searchColor: mapping.searchColor || '#fff34d',
                    mappedColor: mapping.mappedColor || '#4dd0e1'
                };
            });
            
            // 保存迁移后的数据
            saveToStorage();
            
            renderMappings();
            setDefaultColorInputs();
            bindEvents();
            
            console.log('插件初始化完成');
        } catch (error) {
            console.error('初始化错误:', error);
            showStatusMessage('插件初始化失败，请刷新页面重试', 'error');
        }
    }
    
    // 设置默认颜色输入值
    function setDefaultColorInputs() {
        searchColorInput.value = '#fff34d';
        mappedColorInput.value = '#4dd0e1';
    }
    
    // 绑定所有事件处理函数
    function bindEvents() {
        // 添加映射按钮点击事件
        addButton.addEventListener('click', addMapping);
        
        // 更新映射按钮点击事件
        updateButton.addEventListener('click', updateMapping);
        
        // 取消编辑按钮点击事件
        cancelButton.addEventListener('click', cancelEdit);
        
        // 输入框回车事件
        searchTermInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (editingIndex !== -1) {
                    updateMapping();
                } else {
                    addMapping();
                }
            }
        });
        
        mappedTermInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (editingIndex !== -1) {
                    updateMapping();
                } else {
                    addMapping();
                }
            }
        });
        
        // 清除所有按钮点击事件
        clearButton.addEventListener('click', handleClearAll);
        
        // 颜色选择变化事件（添加防抖）
        searchColorInput.addEventListener('input', (e) => debounceColorChange(() => {
            // 实时预览编辑中的颜色变化
            if (editingIndex !== -1) {
                const item = mappingList.children[editingIndex];
                if (item) {
                    const searchSpan = item.querySelector('.search-term');
                    if (searchSpan) {
                        searchSpan.style.backgroundColor = e.target.value;
                    }
                }
            }
        }));
        
        mappedColorInput.addEventListener('input', (e) => debounceColorChange(() => {
            // 实时预览编辑中的颜色变化
            if (editingIndex !== -1) {
                const item = mappingList.children[editingIndex];
                if (item) {
                    const mappedSpan = item.querySelector('.mapped-term');
                    if (mappedSpan) {
                        mappedSpan.style.backgroundColor = e.target.value;
                    }
                }
            }
        }));
        
        // 导出按钮点击事件
        exportButton.addEventListener('click', exportKeywords);
        
        // 导入按钮点击事件
        importButton.addEventListener('click', () => {
            importFileInput.click();
        });
        
        // 导入文件选择事件
        importFileInput.addEventListener('change', handleFileImport);
    }
    
    // 防抖处理颜色变化
    function debounceColorChange(callback, delay = 100) {
        clearTimeout(colorChangeTimeout);
        colorChangeTimeout = setTimeout(callback, delay);
    }
    
    // 从本地存储加载
    function loadFromStorage() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['mappings'], (data) => {
                if (data.mappings && Array.isArray(data.mappings)) {
                    mappings = data.mappings;
                }
                resolve();
            });
        });
    }
    
    // 保存到本地存储
    function saveToStorage() {
        chrome.storage.local.set({ 
            mappings: mappings
        });
    }
    
    // 添加映射函数
    function addMapping() {
        try {
            const searchTerms = searchTermInput.value.trim();
            const mappedTerm = mappedTermInput.value.trim();
            const searchColor = searchColorInput.value;
            const mappedColor = mappedColorInput.value;
            
            // 输入验证
            if (!searchTerms) {
                showStatusMessage('检索关键词不能为空', 'error');
                searchTermInput.focus();
                return;
            }
            
            if (!mappedTerm) {
                showStatusMessage('关联高亮词不能为空', 'error');
                mappedTermInput.focus();
                return;
            }
            
            // 分割多个关键词（用分号）
            const searchTermsArray = searchTerms.split(';')
                .map(term => term.trim())
                .filter(term => term);
                
            if (searchTermsArray.length === 0) {
                showStatusMessage('检索关键词格式不正确，请使用分号分隔', 'error');
                searchTermInput.focus();
                return;
            }

            // 分割多个高亮词（用分号）
            const mappedTermsArray = mappedTerm.split(';')
                .map(term => term.trim())
                .filter(term => term);
                
            if (mappedTermsArray.length === 0) {
                showStatusMessage('关联高亮词格式不正确，请使用分号分隔', 'error');
                mappedTermInput.focus();
                return;
            }
            
            // 检查是否已存在相同的映射
            const exists = mappings.some(mapping => 
                mapping.mappedTerms.join(';') === mappedTermsArray.join(';') &&
                mapping.searchTerms.join(';') === searchTermsArray.join(';')
            );
            
            if (exists) {
                showStatusMessage('此映射关系已存在', 'error');
                return;
            }
            
            // 添加新映射
            mappings.push({ 
                searchTerms: searchTermsArray, 
                mappedTerms: mappedTermsArray,
                searchColor: searchColor,
                mappedColor: mappedColor
            });
            
            // 保存并更新
            saveToStorage();
            renderMappings();
            sendDataToContentScript();
            
            // 清空输入框
            searchTermInput.value = '';
            mappedTermInput.value = '';
            setDefaultColorInputs();
            searchTermInput.focus();
            
            showStatusMessage('映射关系已添加', 'success');
            
        } catch (error) {
            console.error('添加映射错误:', error);
            showStatusMessage('添加失败，请重试', 'error');
        }
    }
    
    // 更新映射函数
    function updateMapping() {
        if (editingIndex === -1) return;
        
        try {
            const searchTerms = searchTermInput.value.trim();
            const mappedTerm = mappedTermInput.value.trim();
            const searchColor = searchColorInput.value;
            const mappedColor = mappedColorInput.value;
            
            // 输入验证
            if (!searchTerms) {
                showStatusMessage('检索关键词不能为空', 'error');
                return;
            }
            
            if (!mappedTerm) {
                showStatusMessage('关联高亮词不能为空', 'error');
                return;
            }
            
            // 分割多个关键词
            const searchTermsArray = searchTerms.split(';')
                .map(term => term.trim())
                .filter(term => term);
                
            if (searchTermsArray.length === 0) {
                showStatusMessage('检索关键词格式不正确，请使用分号分隔', 'error');
                return;
            }

            // 分割多个高亮词
            const mappedTermsArray = mappedTerm.split(';')
                .map(term => term.trim())
                .filter(term => term);
                
            if (mappedTermsArray.length === 0) {
                showStatusMessage('关联高亮词格式不正确，请使用分号分隔', 'error');
                return;
            }
            
            // 更新映射关系
            mappings[editingIndex] = {
                searchTerms: searchTermsArray,
                mappedTerms: mappedTermsArray,
                searchColor: searchColor,
                mappedColor: mappedColor
            };
            
            saveToStorage();
            renderMappings();
            sendDataToContentScript();
            
            // 退出编辑模式
            cancelEdit();
            
            showStatusMessage('映射关系已更新', 'success');
            
        } catch (error) {
            console.error('更新映射错误:', error);
            showStatusMessage('更新失败，请重试', 'error');
        }
    }
    
    // 取消编辑
    function cancelEdit() {
        editingIndex = -1;
        // 清空输入框
        searchTermInput.value = '';
        mappedTermInput.value = '';
        setDefaultColorInputs();
        // 切换按钮显示状态
        addButton.style.display = 'inline-block';
        updateButton.style.display = 'none';
        cancelButton.style.display = 'none';
        searchTermInput.focus();
    }
    
    // 处理清除所有
    function handleClearAll() {
        if (confirm('确定要清除所有关键词映射吗？')) {
            mappings = [];
            saveToStorage();
            renderMappings();
            sendDataToContentScript();
            showStatusMessage('所有映射关系已清除', 'success');
        }
    }
    
    // 渲染映射列表
    function renderMappings() {
        mappingList.innerHTML = '';
        
        if (mappings.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-state';
            emptyDiv.textContent = '暂无映射关系，请添加关键词对';
            mappingList.appendChild(emptyDiv);
            return;
        }
        
        mappings.forEach((mapping, index) => {
            const div = document.createElement('div');
            div.className = `mapping-item ${editingIndex === index ? 'editing' : ''}`;
            
            // 显示检索词
            const searchTermsSpan = document.createElement('span');
            searchTermsSpan.className = 'search-term';
            searchTermsSpan.textContent = mapping.searchTerms.join(';');
            searchTermsSpan.style.backgroundColor = mapping.searchColor;
            searchTermsSpan.style.boxShadow = `0 0 0 1px ${mapping.searchColor}`;
            div.appendChild(searchTermsSpan);
            
            // 箭头
            const arrowSpan = document.createElement('span');
            arrowSpan.className = 'arrow';
            arrowSpan.textContent = '→';
            div.appendChild(arrowSpan);
            
            // 显示多个高亮词
            const mappedTermsSpan = document.createElement('span');
            mappedTermsSpan.className = 'mapped-term';
            mappedTermsSpan.textContent = mapping.mappedTerms.join(';');
            mappedTermsSpan.style.backgroundColor = mapping.mappedColor;
            mappedTermsSpan.style.boxShadow = `0 0 0 1px ${mapping.mappedColor}`;
            div.appendChild(mappedTermsSpan);
            
            // 操作按钮
            const actionDiv = document.createElement('div');
            actionDiv.className = 'action-buttons';
            
            // 编辑按钮
            const editBtn = document.createElement('button');
            editBtn.className = 'edit-btn';
            editBtn.textContent = '✎';
            editBtn.title = '编辑';
            editBtn.addEventListener('click', () => {
                editingIndex = index;
                // 加载当前映射数据到输入框
                searchTermInput.value = mapping.searchTerms.join(';');
                mappedTermInput.value = mapping.mappedTerms.join(';');
                searchColorInput.value = mapping.searchColor;
                mappedColorInput.value = mapping.mappedColor;
                // 切换按钮状态
                addButton.style.display = 'none';
                updateButton.style.display = 'inline-block';
                cancelButton.style.display = 'inline-block';
                searchTermInput.focus();
                renderMappings(); // 重新渲染以高亮编辑项
            });
            actionDiv.appendChild(editBtn);
            
            // 删除按钮
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.textContent = '✕';
            deleteBtn.title = '删除';
            deleteBtn.addEventListener('click', () => {
                if (confirm('确定要删除这个映射关系吗？')) {
                    mappings.splice(index, 1);
                    saveToStorage();
                    renderMappings();
                    sendDataToContentScript();
                    showStatusMessage('映射关系已删除', 'success');
                    
                    // 如果删除的是正在编辑的项，退出编辑模式
                    if (editingIndex === index) {
                        cancelEdit();
                    }
                }
            });
            actionDiv.appendChild(deleteBtn);
            
            div.appendChild(actionDiv);
            mappingList.appendChild(div);
        });
    }
    
    // 显示状态消息
    function showStatusMessage(text, type) {
        statusMessage.textContent = text;
        statusMessage.className = 'status-message ' + type;
        statusMessage.style.display = 'block';
        
        // 3秒后隐藏消息
        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, 3000);
    }
    
    // 发送数据到content script
    function sendDataToContentScript() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'updateData',
                    mappings: mappings
                });
            }
        });
    }
    
    // 导出关键词
    function exportKeywords() {
        if (mappings.length === 0) {
            showStatusMessage('没有可导出的映射关系', 'error');
            return;
        }
        
        const exportData = {
            mappings: mappings,
            exportDate: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'multi-find-settings.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showStatusMessage('设置已导出', 'success');
    }
    
    // 处理文件导入
    function handleFileImport(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importData = JSON.parse(event.target.result);
                
                if (importData.mappings && Array.isArray(importData.mappings)) {
                    // 迁移数据格式
                    mappings = importData.mappings.map(mapping => {
                        // 处理旧格式的mappedTerm
                        if (mapping.mappedTerm && !mapping.mappedTerms) {
                            mapping.mappedTerms = [mapping.mappedTerm];
                            delete mapping.mappedTerm;
                        }
                        
                        // 确保颜色属性存在
                        return {
                            searchTerms: mapping.searchTerms || [],
                            mappedTerms: mapping.mappedTerms || [],
                            searchColor: mapping.searchColor || '#fff34d',
                            mappedColor: mapping.mappedColor || '#4dd0e1'
                        };
                    });
                }
                
                saveToStorage();
                renderMappings();
                sendDataToContentScript();
                
                showStatusMessage('设置已导入', 'success');
            } catch (error) {
                console.error('导入错误:', error);
                showStatusMessage('导入失败，文件格式不正确', 'error');
            }
        };
        reader.readAsText(file);
        
        // 重置输入，允许重复选择同一个文件
        importFileInput.value = '';
    }
});
    