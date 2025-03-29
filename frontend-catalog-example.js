import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import axios from 'axios';

// API configuration
const API_CONFIG = {
  // Using the correct Square-compatible path format
  BASE_URL: 'https://gki8kva7e3.execute-api.us-west-1.amazonaws.com/production/v2/catalog',
  ENDPOINTS: {
    LIST: '/list',
    SEARCH: '/search',
  }
};

const CategoriesScreen = ({ accessToken }) => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    if (!accessToken) {
      setError('No access token provided');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Option 1: Using the list endpoint with type filter
      const response = await axios.get(
        `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.LIST}?types=CATEGORY`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      // Alternative Option 2: Using the search endpoint for more filters
      /* 
      const response = await axios.post(
        `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SEARCH}`,
        {
          objectTypes: ["CATEGORY"],
          limit: 50,
          // You can add more filters here
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      */
      
      console.log('Categories response:', response.data);
      
      // Extract categories from the response
      const categoriesData = response.data.objects || [];
      setCategories(categoriesData);
      setLoading(false);
    } catch (err) {
      console.error('[Categories] Error fetching categories', {
        error: err.response?.data || err.message,
      });
      setError(err.response?.data?.message || err.message || 'Failed to fetch categories');
      setLoading(false);
    }
  };

  const renderCategory = ({ item }) => {
    // Categories have a categoryData property
    const categoryName = item.categoryData?.name || 'Unnamed Category';
    
    return (
      <View style={styles.categoryItem}>
        <Text style={styles.categoryName}>{categoryName}</Text>
        <Text style={styles.categoryId}>ID: {item.id}</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text style={styles.loadingText}>Loading categories...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Error: {error}</Text>
        <Text style={styles.hintText}>
          Please make sure your access token is valid and has catalog permissions.
        </Text>
      </View>
    );
  }

  if (categories.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.noItemsText}>No categories found</Text>
        <Text style={styles.hintText}>
          Try creating some categories in your Square Dashboard first.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Categories</Text>
      <FlatList
        data={categories}
        renderItem={renderCategory}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  list: {
    paddingBottom: 20,
  },
  categoryItem: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  categoryName: {
    fontSize: 18,
    fontWeight: '500',
    color: '#333',
  },
  categoryId: {
    fontSize: 14,
    color: '#777',
    marginTop: 4,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#555',
  },
  errorText: {
    fontSize: 16,
    color: 'red',
    marginBottom: 8,
  },
  noItemsText: {
    fontSize: 16,
    color: '#555',
    marginBottom: 8,
  },
  hintText: {
    fontSize: 14,
    color: '#777',
    textAlign: 'center',
    marginHorizontal: 20,
  },
});

export default CategoriesScreen; 