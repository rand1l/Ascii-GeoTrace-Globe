# Ascii-GeoTrace-Globe
This is tool on JS (frontend) and Go (backend) that visualizes network traceroute data on a 3D ASCII-rendered globe. It allows users to observe and analyze network path across the world.

**To use this you will need a .mmdb file in ./assets/ and your token from the ipinfo account in the ipInfoToken variable in main.go**
## Installation

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/rand1l/Ascii-GeoTrace-Globe.git

2. **Navigate to the Project Directory**
   ```bash
   cd Ascii-GeoTrace-Globe
   
3. **Install Dependencies**
   ```bash
   go mod download

4. **Run the Application**
   ```bash
   sudo go run main.go

## Install with docker

1. **Build image**
   ```bash
    docker build -t traceroute-server .
   
2. **Run**
   ```bash
   docker run -p 8080:8080 traceroute-server
