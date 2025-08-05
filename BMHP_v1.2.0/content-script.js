// 存储当前的映射关系
let currentMappings = [];
// 缓存正则表达式，避免重复创建
let regexCache = new Map();
// 标记是否正在处理，避免重复执行
let isProcessing = false;
// DOM变化观察器实例
let mutationObserver = null;

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateData') {
        // 如果正在处理，先取消
        if (isProcessing) {
            // 快速清除现有高亮
            removeAllHighlights();
        }
        
        // 更新数据
        currentMappings = request.mappings || [];
        
        // 清空缓存
        regexCache.clear();
        
        // 应用高亮（使用requestIdleCallback在浏览器空闲时执行）
        if (currentMappings.length > 0) {
            requestIdleCallback(() => {
                applyHighlights();
            }, { timeout: 1000 });
        } else {
            // 没有映射关系，直接清除
            removeAllHighlights();
        }
    }
});

// 初始化函数
function initHighlighter() {
    chrome.storage.local.get(['mappings'], (data) => {
        if (data.mappings && Array.isArray(data.mappings)) {
            // 迁移数据格式
            currentMappings = data.mappings.map(mapping => {
                // 处理旧格式数据
                if (mapping.mappedTerm && !mapping.mappedTerms) {
                    return {
                        searchTerms: mapping.searchTerms || [],
                        mappedTerms: [mapping.mappedTerm],
                        searchColor: mapping.searchColor || '#fff34d',
                        mappedColor: mapping.mappedColor || '#4dd0e1'
                    };
                }
                return {
                    searchTerms: mapping.searchTerms || [],
                    mappedTerms: mapping.mappedTerms || [],
                    searchColor: mapping.searchColor || '#fff34d',
                    mappedColor: mapping.mappedColor || '#4dd0e1'
                };
            });
        }
        
        // 启动DOM变化监听
        startMutationObserver();
        
        // 初始高亮
        if (currentMappings.length > 0) {
            applyHighlights();
        }
    });
}

// 启动DOM变化观察器
function startMutationObserver() {
    // 如果已有观察器，先停止
    if (mutationObserver) {
        mutationObserver.disconnect();
    }
    
    // 配置观察器
    const config = {
        childList: true,
        subtree: true,
        characterData: true,
        characterDataOldValue: false
    };
    
    // 创建新的观察器
    mutationObserver = new MutationObserver((mutations) => {
        // 收集所有新增节点
        const addedNodes = [];
        mutations.forEach(mutation => {
            // 处理新增节点
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        addedNodes.push(node);
                    }
                });
            }
            // 处理文本内容变化
            else if (mutation.type === 'characterData' && mutation.target.nodeType === Node.TEXT_NODE) {
                addedNodes.push(mutation.target.parentNode);
            }
        });
        
        // 如果有新增内容且有映射关系，执行高亮
        if (addedNodes.length > 0 && currentMappings.length > 0) {
            requestIdleCallback(() => {
                processNewContent(addedNodes);
            }, { timeout: 500 });
        }
    });
    
    // 开始观察文档
    if (document.body) {
        mutationObserver.observe(document.body, config);
    } else {
        // 如果body还未加载，等待加载完成
        document.addEventListener('DOMContentLoaded', () => {
            mutationObserver.observe(document.body, config);
        });
    }
}

// 处理新添加的内容
function processNewContent(nodes) {
    if (isProcessing || currentMappings.length === 0) return;
    
    // 收集所有要高亮的关键词及其类型，并排序
    const termsToHighlight = getTermsToHighlight();
    
    // 处理每个新增节点
    nodes.forEach(node => {
        const textNodes = [];
        walkTextNodes(node, (n) => textNodes.push(n));
        textNodes.forEach(textNode => {
            processTextNode(textNode, termsToHighlight);
        });
    });
}

// 生成所有需要高亮的词及其样式信息
function getTermsToHighlight() {
    const termsToHighlight = [];
    
    currentMappings.forEach((mapping, groupIndex) => {
        // 添加检索词
        mapping.searchTerms.forEach(term => {
            if (term) {
                termsToHighlight.push({
                    term: term,
                    type: 'search-term',
                    group: groupIndex,
                    color: mapping.searchColor,
                    length: term.length
                });
            }
        });
        
        // 添加多个关联高亮词
        mapping.mappedTerms.forEach(term => {
            if (term) {
                termsToHighlight.push({
                    term: term,
                    type: 'mapped-term',
                    group: groupIndex,
                    color: mapping.mappedColor,
                    length: term.length
                });
            }
        });
    });
    
    // 按长度排序，长词优先，避免短词匹配覆盖长词
    return termsToHighlight.sort((a, b) => b.length - a.length);
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHighlighter);
} else {
    initHighlighter();
}

// 清除所有高亮
function removeAllHighlights() {
    const fragment = document.createDocumentFragment();
    const highlights = document.querySelectorAll('.multi-find-highlight');
    
    highlights.forEach(highlight => {
        while (highlight.firstChild) {
            fragment.appendChild(highlight.firstChild);
        }
        highlight.parentNode.replaceChild(fragment.cloneNode(true), highlight);
    });
}

// 应用高亮到整个页面
function applyHighlights() {
    if (currentMappings.length === 0 || isProcessing) return;
    
    isProcessing = true;
    
    try {
        // 收集所有要高亮的关键词
        const termsToHighlight = getTermsToHighlight();
        
        // 收集所有文本节点
        const textNodes = [];
        walkTextNodes(document.body, (node) => textNodes.push(node));
        
        // 分块处理节点
        const chunkSize = 50;
        let index = 0;
        
        function processNextChunk(deadline) {
            while (index < textNodes.length && deadline.timeRemaining() > 10) {
                processTextNode(textNodes[index], termsToHighlight);
                index++;
            }
            
            if (index < textNodes.length) {
                requestIdleCallback(processNextChunk);
            } else {
                isProcessing = false;
            }
        }
        
        requestIdleCallback(processNextChunk);
        
    } catch (error) {
        console.error('高亮处理错误:', error);
        isProcessing = false;
    }
}

// 处理单个文本节点
function processTextNode(textNode, termsToHighlight) {
    // 跳过已经处理过的节点
    if (textNode.parentNode && textNode.parentNode.classList.contains('multi-find-highlight')) {
        return;
    }
    
    const text = textNode.nodeValue;
    let lastIndex = 0;
    let matched = false;
    let fragments = [];
    
    termsToHighlight.forEach(({ term, type, group, color }) => {
        if (!term || lastIndex >= text.length) return;
        
        let regex;
        // 使用组索引+词+类型作为缓存键，确保每组的相同词能正确区分
        const cacheKey = `${group}-${term}-${type}`;
        
        if (regexCache.has(cacheKey)) {
            regex = regexCache.get(cacheKey);
        } else {
            regex = new RegExp(escapeRegExp(term), 'gi');
            regexCache.set(cacheKey, regex);
        }
        
        regex.lastIndex = lastIndex;
        
        let match;
        while ((match = regex.exec(text)) !== null) {
            const [matchedText] = match;
            const start = match.index;
            const end = start + matchedText.length;
            
            if (start >= lastIndex && end <= text.length) {
                matched = true;
                
                if (start > lastIndex) {
                    fragments.push(document.createTextNode(text.substring(lastIndex, start)));
                }
                
                const span = document.createElement('span');
                span.className = `multi-find-highlight ${type} group-${group}`;
                span.textContent = matchedText;
                // 应用当前组的颜色
                span.style.backgroundColor = color;
                span.style.boxShadow = `0 0 0 1px ${color}`;
                // 继承父元素样式
                span.style.fontFamily = 'inherit';
                span.style.fontSize = 'inherit';
                span.style.lineHeight = 'inherit';
                span.style.letterSpacing = 'inherit';
                
                fragments.push(span);
                lastIndex = end;
                regex.lastIndex = lastIndex;
            } else {
                break;
            }
        }
    });
    
    if (lastIndex < text.length) {
        fragments.push(document.createTextNode(text.substring(lastIndex)));
    }
    
    if (matched && fragments.length > 0) {
        const fragment = document.createDocumentFragment();
        fragments.forEach(node => fragment.appendChild(node));
        textNode.parentNode.replaceChild(fragment, textNode);
    }
}

// 遍历文本节点
function walkTextNodes(node, callback) {
    if (node.nodeType === Node.COMMENT_NODE) return;
    
    if (node.nodeType === Node.ELEMENT_NODE) {
        // 跳过不需要处理的元素
        if (node.classList.contains('multi-find-highlight') || 
            ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'SVG', 'CANVAS'].includes(node.tagName)) {
            return;
        }
        
        if (node.hasAttribute('data-multi-find-ignore')) {
            return;
        }
    }
    
    if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim() !== '') {
        callback(node);
        return;
    }
    
    let child = node.firstChild;
    while (child) {
        const nextChild = child.nextSibling;
        walkTextNodes(child, callback);
        child = nextChild;
    }
}

// 正则转义
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
    