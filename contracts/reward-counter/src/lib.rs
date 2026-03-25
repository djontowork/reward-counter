#![no_std]

use soroban_sdk::{contract, contractimpl, symbol_short, Env, Symbol};

#[contract]
pub struct RewardCounter;

const COUNT: Symbol = symbol_short!("COUNT");

#[contractimpl]
impl RewardCounter {
    /// Increases the counter by 1 and returns the updated value
    pub fn increment(env: Env) -> u32 {
        // Retrieve the current count from the environment's instance storage
        // If it doesn't exist, we start at 0
        let mut count: u32 = env.storage().instance().get(&COUNT).unwrap_or(0);
        
        // Increment the count
        count += 1;
        
        // Save the updated count back to storage
        env.storage().instance().set(&COUNT, &count);
        
        // Return the updated count
        count
    }

    /// Returns the current counter value
    pub fn get_count(env: Env) -> u32 {
        // Retrieve the count from storage, defaulting to 0
        env.storage().instance().get(&COUNT).unwrap_or(0)
    }
}
