#!/usr/bin/env python3
"""
Voice Diary Backend API Test Suite
Tests all backend endpoints for the Voice Diary application
"""

import requests
import json
import sys
from datetime import datetime

# API Configuration
BASE_URL = "https://flow-loader-spark.preview.emergentagent.com/api"

class VoiceDiaryTester:
    def __init__(self):
        self.base_url = BASE_URL
        self.access_token = None
        self.test_user_email = "testuser@voicediary.com"
        self.test_user_password = "SecurePass123!"
        self.test_user_name = "Voice Diary Test User"
        self.results = []
        
    def log_result(self, test_name, success, message, response_data=None):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        result = {
            "test": test_name,
            "status": status,
            "message": message,
            "timestamp": datetime.now().isoformat()
        }
        if response_data:
            result["response"] = response_data
        self.results.append(result)
        print(f"{status} {test_name}: {message}")
        
    def test_health_endpoints(self):
        """Test health check endpoints"""
        print("\n=== Testing Health Endpoints ===")
        
        # Test root endpoint
        try:
            response = requests.get(f"{self.base_url}/", timeout=10)
            if response.status_code == 200:
                data = response.json()
                if data.get("message") == "Diário de Voz API" and data.get("status") == "online":
                    self.log_result("Root Health Check", True, "API root endpoint working correctly", data)
                else:
                    self.log_result("Root Health Check", False, f"Unexpected response format: {data}")
            else:
                self.log_result("Root Health Check", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_result("Root Health Check", False, f"Connection error: {str(e)}")
            
        # Test health endpoint
        try:
            response = requests.get(f"{self.base_url}/health", timeout=10)
            if response.status_code == 200:
                data = response.json()
                if "status" in data and "timestamp" in data:
                    self.log_result("Health Endpoint", True, "Health endpoint working correctly", data)
                else:
                    self.log_result("Health Endpoint", False, f"Missing required fields in response: {data}")
            else:
                self.log_result("Health Endpoint", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_result("Health Endpoint", False, f"Connection error: {str(e)}")
    
    def test_user_registration(self):
        """Test user registration"""
        print("\n=== Testing User Registration ===")
        
        user_data = {
            "email": self.test_user_email,
            "password": self.test_user_password,
            "name": self.test_user_name
        }
        
        try:
            response = requests.post(
                f"{self.base_url}/auth/register",
                json=user_data,
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if "access_token" in data and "user" in data:
                    self.access_token = data["access_token"]
                    user_info = data["user"]
                    if (user_info.get("email") == self.test_user_email and 
                        user_info.get("name") == self.test_user_name and
                        "id" in user_info):
                        self.log_result("User Registration", True, "User registered successfully", {
                            "user_id": user_info["id"],
                            "email": user_info["email"],
                            "name": user_info["name"]
                        })
                    else:
                        self.log_result("User Registration", False, f"Invalid user data in response: {user_info}")
                else:
                    self.log_result("User Registration", False, f"Missing access_token or user in response: {data}")
            elif response.status_code == 400:
                # User might already exist, try to login instead
                self.log_result("User Registration", False, "User already exists (will try login)", response.json())
            else:
                self.log_result("User Registration", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_result("User Registration", False, f"Connection error: {str(e)}")
    
    def test_user_login(self):
        """Test user login"""
        print("\n=== Testing User Login ===")
        
        login_data = {
            "email": self.test_user_email,
            "password": self.test_user_password
        }
        
        try:
            response = requests.post(
                f"{self.base_url}/auth/login",
                json=login_data,
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if "access_token" in data and "user" in data:
                    self.access_token = data["access_token"]
                    user_info = data["user"]
                    if (user_info.get("email") == self.test_user_email and 
                        "id" in user_info and "name" in user_info):
                        self.log_result("User Login", True, "User logged in successfully", {
                            "user_id": user_info["id"],
                            "email": user_info["email"],
                            "token_received": True
                        })
                    else:
                        self.log_result("User Login", False, f"Invalid user data in response: {user_info}")
                else:
                    self.log_result("User Login", False, f"Missing access_token or user in response: {data}")
            else:
                self.log_result("User Login", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_result("User Login", False, f"Connection error: {str(e)}")
    
    def test_get_current_user(self):
        """Test getting current user info (protected endpoint)"""
        print("\n=== Testing Get Current User (Protected) ===")
        
        if not self.access_token:
            self.log_result("Get Current User", False, "No access token available - login failed")
            return
            
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        
        try:
            response = requests.get(f"{self.base_url}/auth/me", headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if ("id" in data and "email" in data and "name" in data and 
                    data.get("email") == self.test_user_email):
                    self.log_result("Get Current User", True, "Protected endpoint working correctly", {
                        "user_id": data["id"],
                        "email": data["email"],
                        "name": data["name"]
                    })
                else:
                    self.log_result("Get Current User", False, f"Invalid user data: {data}")
            elif response.status_code == 401:
                self.log_result("Get Current User", False, "Authentication failed - invalid token")
            else:
                self.log_result("Get Current User", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_result("Get Current User", False, f"Connection error: {str(e)}")
    
    def test_get_memories(self):
        """Test getting memories (protected endpoint)"""
        print("\n=== Testing Get Memories (Protected) ===")
        
        if not self.access_token:
            self.log_result("Get Memories", False, "No access token available - login failed")
            return
            
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        
        try:
            response = requests.get(f"{self.base_url}/memories", headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if "memories" in data and "total" in data:
                    # Should be empty for new user
                    if isinstance(data["memories"], list) and data["total"] >= 0:
                        self.log_result("Get Memories", True, f"Memories endpoint working - found {data['total']} memories", {
                            "total_memories": data["total"],
                            "memories_count": len(data["memories"])
                        })
                    else:
                        self.log_result("Get Memories", False, f"Invalid memories data structure: {data}")
                else:
                    self.log_result("Get Memories", False, f"Missing memories or total in response: {data}")
            elif response.status_code == 401:
                self.log_result("Get Memories", False, "Authentication failed - invalid token")
            else:
                self.log_result("Get Memories", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_result("Get Memories", False, f"Connection error: {str(e)}")
    
    def test_get_stats(self):
        """Test getting stats overview (protected endpoint)"""
        print("\n=== Testing Get Stats Overview (Protected) ===")
        
        if not self.access_token:
            self.log_result("Get Stats Overview", False, "No access token available - login failed")
            return
            
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        
        try:
            response = requests.get(f"{self.base_url}/memories/stats/overview", headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["total_memories", "total_duration_minutes", "emotion_distribution", "mood_average", "streak_days"]
                
                if all(field in data for field in required_fields):
                    # For new user, should have zeros
                    if (isinstance(data["total_memories"], int) and 
                        isinstance(data["total_duration_minutes"], (int, float)) and
                        isinstance(data["emotion_distribution"], list) and
                        isinstance(data["mood_average"], (int, float)) and
                        isinstance(data["streak_days"], int)):
                        self.log_result("Get Stats Overview", True, "Stats endpoint working correctly", {
                            "total_memories": data["total_memories"],
                            "total_duration_minutes": data["total_duration_minutes"],
                            "mood_average": data["mood_average"],
                            "streak_days": data["streak_days"],
                            "emotion_count": len(data["emotion_distribution"])
                        })
                    else:
                        self.log_result("Get Stats Overview", False, f"Invalid data types in stats: {data}")
                else:
                    self.log_result("Get Stats Overview", False, f"Missing required fields in stats: {data}")
            elif response.status_code == 401:
                self.log_result("Get Stats Overview", False, "Authentication failed - invalid token")
            else:
                self.log_result("Get Stats Overview", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_result("Get Stats Overview", False, f"Connection error: {str(e)}")
    
    def run_all_tests(self):
        """Run all tests in sequence"""
        print(f"🚀 Starting Voice Diary Backend API Tests")
        print(f"📍 Testing against: {self.base_url}")
        print("=" * 60)
        
        # Run tests in order
        self.test_health_endpoints()
        self.test_user_registration()
        
        # If registration failed, try login
        if not self.access_token:
            self.test_user_login()
        
        # Run protected endpoint tests
        self.test_get_current_user()
        self.test_get_memories()
        self.test_get_stats()
        
        # Summary
        self.print_summary()
    
    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for r in self.results if "✅ PASS" in r["status"])
        failed = sum(1 for r in self.results if "❌ FAIL" in r["status"])
        total = len(self.results)
        
        print(f"Total Tests: {total}")
        print(f"✅ Passed: {passed}")
        print(f"❌ Failed: {failed}")
        print(f"Success Rate: {(passed/total*100):.1f}%" if total > 0 else "No tests run")
        
        if failed > 0:
            print("\n🔍 FAILED TESTS:")
            for result in self.results:
                if "❌ FAIL" in result["status"]:
                    print(f"  • {result['test']}: {result['message']}")
        
        print("\n📝 DETAILED RESULTS:")
        for result in self.results:
            print(f"  {result['status']} {result['test']}")
            if result.get('response'):
                print(f"    Response: {json.dumps(result['response'], indent=2)}")

if __name__ == "__main__":
    tester = VoiceDiaryTester()
    tester.run_all_tests()