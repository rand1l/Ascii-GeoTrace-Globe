package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/kanocz/tracelib"
	"github.com/oschwald/geoip2-golang"
)

var geoDB struct {
	GeoIP2 *geoip2.Reader
	ASN    *geoip2.Reader
}

const ipInfoToken = "" // YOUR TOKEN HERE !!!

type IpInfoResponse struct {
	City    string `json:"city"`
	Country string `json:"country"`
	Loc     string `json:"loc"`
}

type HopData struct {
	Number      int    `json:"number"`
	IP          string `json:"ip"`
	Host        string `json:"host"`
	RTT         string `json:"rtt"`
	Location    string `json:"location"`
	Coordinates string `json:"coordinates"`
}

func initGeoDB() error {
	var err error

	geoDB.GeoIP2, err = geoip2.Open("assets/GeoLite2-City.mmdb")
	if err != nil {
		return fmt.Errorf("failed to open GeoIP2 database: %w", err)
	}

	geoDB.ASN, err = geoip2.Open("assets/GeoLite2-ASN.mmdb")
	if err != nil {
		fmt.Println("ASN database not found, continuing without it.")
	}

	return nil
}

func getCityCountryAndLocationFromIpInfo(ip string) (string, string, string) {
	resp, err := http.Get(fmt.Sprintf("https://ipinfo.io/%s?token=%s", ip, ipInfoToken))
	if err != nil {
		fmt.Println("Error making request to ipinfo.io:", err)
		return "N/A", "N/A", "N/A"
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		fmt.Printf("Error response from ipinfo.io: %d\n", resp.StatusCode)
		return "N/A", "N/A", "N/A"
	}

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		fmt.Println("Error reading response from ipinfo.io:", err)
		return "N/A", "N/A", "N/A"
	}

	var ipInfo IpInfoResponse
	if err := json.Unmarshal(body, &ipInfo); err != nil {
		fmt.Println("Error parsing JSON from ipinfo.io:", err)
		return "N/A", "N/A", "N/A"
	}

	location := ipInfo.Loc
	return ipInfo.City, ipInfo.Country, location
}

func runTraceroute(target string, maxRTT int64, maxTTL int, flusher http.Flusher, w http.ResponseWriter) error {
	cache := tracelib.NewLookupCache()

	callback := func(hop tracelib.Hop, num int, round int) {
		if hop.Error != nil {
			return
		}

		ip := net.ParseIP(hop.Addr.String())
		country := ""
		city := ""
		location := "N/A"

		if geoDB.GeoIP2 != nil {
			record, err := geoDB.GeoIP2.City(ip)
			if err == nil {
				country = record.Country.Names["en"]
				city = record.City.Names["en"]
				location = fmt.Sprintf("%.4f, %.4f", record.Location.Latitude, record.Location.Longitude)
			}
		}

		if city == "" || country == "" || location == "N/A" {
			apiCity, apiCountry, apiLocation := getCityCountryAndLocationFromIpInfo(ip.String())
			city = apiCity
			country = apiCountry
			location = apiLocation
		}

		displayLocation := country
		if city != "" && city != "N/A" {
			displayLocation += "/" + city
		}

		hopData := HopData{
			Number:      num,
			IP:          hop.Addr.String(),
			Host:        strings.TrimSuffix(hop.Host, "."),
			RTT:         fmt.Sprintf("%.3f", float64(hop.RTT.Milliseconds())+float64(hop.RTT.Nanoseconds()%1e6)/1e6),
			Location:    displayLocation,
			Coordinates: location,
		}

		hopJSON, err := json.Marshal(hopData)
		if err != nil {
			fmt.Println("Error marshaling hop data:", err)
			return
		}

		fmt.Fprintf(w, "data: %s\n\n", hopJSON)
		flusher.Flush()
	}

	hops, err := tracelib.RunTrace(
		target,
		"0.0.0.0",
		"::",
		time.Second*time.Duration(maxRTT),
		maxTTL,
		cache,
		callback,
	)
	if err != nil {
		errorData := map[string]string{"error": fmt.Sprintf("Traceroute error: %v", err)}
		errorJSON, _ := json.Marshal(errorData)
		fmt.Fprintf(w, "event: error\ndata: %s\n\n", errorJSON)
		flusher.Flush()
		return err
	}

	fmt.Println("Traceroute completed:", hops)
	return nil
}


func handler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported!", http.StatusInternalServerError)
		return
	}

	target := "8.8.8.8"

	runTraceroute(target, 5, 30, flusher, w)
}

func main() {
	if err := initGeoDB(); err != nil {
		fmt.Println("GeoIP2 database initialization error:", err)
		os.Exit(1)
	}
	defer geoDB.GeoIP2.Close()
	if geoDB.ASN != nil {
		defer geoDB.ASN.Close()
	}

	http.Handle("/", http.FileServer(http.Dir("./frontend")))

	http.HandleFunc("/trace", handler)

	fmt.Println("Server started at http://localhost:8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		fmt.Println("Server startup error:", err)
	}
}


