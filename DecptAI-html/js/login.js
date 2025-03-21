// 初始化Web3
let web3;
let contract;
let account;

// 合约地址和ABI
const contractAddress = '0xB407DAB54c908Dac769DaB7abd929761eD25a81A';
const contractABI = [/* YOUR_CONTRACT_ABI */];

// 初始化
async function init() {
    // 检查是否安装MetaMask
    if (typeof window.ethereum !== 'undefined') {
        web3 = new Web3(window.ethereum);
        
        // 设置连接钱包按钮事件
        document.getElementById('connect-btn').addEventListener('click', async () => {
            try {
                // 请求账户访问
                const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
                account = accounts[0];
                
                // 初始化合约实例
                contract = new web3.eth.Contract(contractABI, contractAddress);
                
                // 显示角色选择按钮
                document.getElementById('role-buttons').style.display = 'block';
                document.getElementById('connect-btn').style.display = 'none';
                
                // 设置角色按钮事件
                setupButtons();
            } catch (error) {
                console.error("User denied account access", error);
                alert('连接钱包失败，请重试');
            }
        });
    } else {
        alert('请安装MetaMask钱包');
        document.getElementById('connect-btn').disabled = true;
    }
}

// 设置按钮事件
function setupButtons() {
    document.getElementById('guess-btn').addEventListener('click', async () => {
        try {
            // 调用guess角色合约方法
            await contract.methods.becomeGuess().send({ from: account });
            window.location.href = 'index.html';
        } catch (error) {
            console.error('Guess角色设置失败:', error);
        }
    });

    document.getElementById('player-btn').addEventListener('click', async () => {
        try {
            // 调用player角色合约方法
            await contract.methods.becomePlayer().send({ from: account });
            window.location.href = 'index.html';
        } catch (error) {
            console.error('Player角色设置失败:', error);
        }
    });
}

// 页面加载时初始化
window.addEventListener('load', init);
