const crypto = require("crypto"); SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");
const EC = require("elliptic").ec, ec = new EC("secp256k1");

const MINT_KEY_PAIR = ec.genKeyPair();
const MINT_PUBLIC_ADDRESS = MINT_KEY_PAIR.getPublic("hex");

const holderKeyPair = ec.genKeyPair();

const keyPair = ec.genKeyPair();
// public key: keyPair.getPublic("hex")
// private key: keyPair.getPrivate("hex")

class Block {
    constructor(timestamp = "", data = []) {
        this.timestamp = timestamp;
        this.data = data;
        this.hash = this.getHash();
        this.prevHash = "";
        this.nonce = 0;
    }

    getHash() {
        return SHA256(this.prevHash + this.timestamp + JSON.stringify(this.data) + this.nonce);
    }

    mine(difficulty) {
        while(!this.hash.startsWith(Array(difficulty + 1).join("0"))) {
            this.nonce++;
            this.hash = this.getHash();
        }
    }

    hasValidTransactions(chain) {
        let gas = 0, reward = 0;

        this.data.forEach(transaction => {
            if (transaction.from !== MINT_PUBLIC_ADDRESS) {
                gas += transaction.gas;
            } else {
                reward = transaction.amount;
            }
        });

        return (
            reward - gas === chain.reward &&
            this.data.every(transaction => transaction.isValid(transaction, chain)) && 
            this.data.filter(transaction => transaction.from === MINT_PUBLIC_ADDRESS).length === 1
        );
    }
}

class Blockchain {
    constructor() {
        const initalCoinRelease = new Transaction(MINT_PUBLIC_ADDRESS, holderKeyPair.getPublic("hex"), 100000);
        this.chain = [new Block(Date.now().toString(), [initalCoinRelease])];
        this.difficulty = 1;
        this.blockTime = 30000;
        this.transactions = [];
        this.reward = 297;
    }

    getLastBlock() {
        return this.chain[this.chain.length - 1];
    }

    getBalance(address) {
        let balance = 0;

        this.chain.forEach(block => {
            block.data.forEach(transaction => {
                if (transaction.from === address) {
                    balance -= transaction.amount;
                    balance -= transaction.gas
                }

                if (transaction.to === address) {
                    balance += transaction.amount;
                }
            })
        });

        return balance;
    }

    addBlock(block) {
        block.prevHash = this.getLastBlock().hash;
        block.hash = block.getHash();

        block.mine(this.difficulty);
        this.chain.push(block);

        this.difficulty += Date.now() - parseInt(this.getLastBlock().timestamp) < this.blockTime ? 1 : -1;
    }

    addTransaction(transaction) {
        if (transaction.isValid(transaction, this)) {
            this.transactions.push(transaction);
        }
    }

    mineTransactions(rewardAddress) {
        let gas = 0;

        this.transactions.forEach(transaction => {
            gas += transaction.gas;
        });

        const rewardTransaction = new Transaction(MINT_PUBLIC_ADDRESS, rewardAddress, this.reward + gas);
        rewardTransaction.sign(MINT_KEY_PAIR);

        // Prevent people from minting coins and mine the minting transaction.
        if (this.transactions.length !== 0) this.addBlock(new Block(Date.now().toString(), [rewardTransaction, ...this.transactions]));

        this.transactions = [];
    }

    isValid(blockchain = this) {
        for (let i = 1; i < blockchain.chain.length; i++) {
            const currentBlock = blockchain.chain[i];
            const prevBlock = blockchain.chain[i-1];

            if (
                currentBlock.hash !== currentBlock.getHash() || 
                prevBlock.hash !== currentBlock.prevHash || 
                currentBlock.hasValidTransactions(blockchain)
            ) {
                return false;
            }
        }
        return true;
    }
}

class Transaction {
        // Gas will be set to 0 because we are making it optional
        constructor(from, to, amount, gas = 0) {
            this.from = from;
            this.to = to;
            this.amount = amount;
            this.gas = gas;
        }

        sign(keyPair) {
            if (keyPair.getPublic("hex") === this.from) {
                // Add gas
                this.signature = keyPair.sign(SHA256(this.from + this.to + this.amount + this.gas), "base64").toDER("hex");
            }
        }

        isValid(tx, chain) {
            return (
                tx.from &&
                tx.to &&
                tx.amount &&
                // Add gas
                (chain.getBalance(tx.from) >= tx.amount + tx.gas || tx.from === MINT_PUBLIC_ADDRESS && tx.amount === chain.reward) &&
                ec.keyFromPublic(tx.from, "hex").verify(SHA256(tx.from + tx.to + tx.amount + tx.gas), tx.signature)
            );
        }
    }

const JeChain = new Blockchain();

const girlfriendWallet = ec.genKeyPair();

// Create a transaction
const transaction = new Transaction(holderKeyPair.getPublic("hex"), girlfriendWallet.getPublic("hex"), 100, 10);
// Sign the transaction
transaction.sign(holderKeyPair);
// Add transaction to pool
JeChain.addTransaction(transaction);
// Mine transaction
JeChain.mineTransactions(holderKeyPair.getPublic("hex"));

// Prints out balance of both address
console.log("Your balance:", JeChain.getBalance(holderKeyPair.getPublic("hex")));
console.log("Your girlfriend's balance:", JeChain.getBalance(girlfriendWallet.getPublic("hex")));
